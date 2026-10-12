import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

// Verify requester is an active restaurant owner via cryptographically verified JWT
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function verifyOwner(req: Request, supabaseAdmin: any) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { isOwner: false, error: "Unauthorized: Access token missing", status: 401 };
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    return { isOwner: false, error: "Unauthorized: Invalid or expired session", status: 401 };
  }

  const authUserId = authData.user.id;

  // Check if active owner in restaurant_users
  const { data: ruData, error: ruError } = await supabaseAdmin
    .from("restaurant_users")
    .select("restaurant_id, role, is_active")
    .eq("user_id", authUserId)
    .single();

  if (ruError || !ruData || ruData.role !== "owner" || !ruData.is_active) {
    return { isOwner: false, error: "Forbidden: Operation reserved for Owner only", status: 403 };
  }

  return { isOwner: true, user: authData.user, restaurantId: ruData.restaurant_id };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return jsonResponse({ error: "Server configuration missing" }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { action } = body;

  try {
    // ========================================================
    // 1. CHECK SETUP STATUS (Public / Unauthenticated check)
    // ========================================================
    if (action === "check_setup_status") {
      const { count, error: countErr } = await supabaseAdmin
        .from("restaurant_users")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "owner");

      if (countErr) {
        return jsonResponse({ error: "Failed to determine setup status." }, 500);
      }

      const isSetupRequired = !count || count === 0;

      let restaurantName = "Demo Restaurant";
      const { data: restData } = await supabaseAdmin
        .from("restaurants")
        .select("name")
        .limit(1)
        .maybeSingle();

      if (restData?.name) {
        restaurantName = restData.name;
      }

      return jsonResponse({
        is_setup_required: isSetupRequired,
        restaurant_name: restaurantName,
      });
    }

    // ========================================================
    // 2. SETUP INITIAL OWNER (Protected First-Time Setup Wizard)
    // ========================================================
    if (action === "setup_initial_owner") {
      // Abuse prevention: verify no owner already exists on the entire system
      const { count } = await supabaseAdmin
        .from("restaurant_users")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "owner");

      if (count && count > 0) {
        return jsonResponse(
          { error: "Setup has already been completed. New owners cannot be registered here." },
          400
        );
      }

      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const restaurantName = typeof body.restaurant_name === "string" ? body.restaurant_name.trim() : "Demo Restaurant";

      if (!username || !password) {
        return jsonResponse({ error: "Username and password are required." }, 400);
      }

      const cleanUsername = username.toLowerCase();
      if (
        cleanUsername.length < 3 ||
        cleanUsername.length > 30 ||
        !/^[a-zA-Z0-9_]+$/.test(cleanUsername)
      ) {
        return jsonResponse(
          { error: "Username must be 3-30 characters long and contain only letters, numbers, and underscores." },
          400
        );
      }

      if (password.length < 8) {
        return jsonResponse({ error: "Password must be at least 8 characters long." }, 400);
      }

      // 1. Create Supabase Auth user with internal local identity
      const internalEmail = `owner_${crypto.randomUUID()}@auth.local`;
      const { data: newAuthData, error: createAuthError } =
        await supabaseAdmin.auth.admin.createUser({
          email: internalEmail,
          password,
          email_confirm: true,
        });

      if (createAuthError || !newAuthData?.user) {
        return jsonResponse({ error: createAuthError?.message || "Failed to create authentication user." }, 500);
      }

      const ownerUserId = newAuthData.user.id;

      // 2. Atomically link owner & restaurant via database function setup_first_owner
      let restaurantId: string = "";
      const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "restaurant";

      const { data: rpcRestaurantId, error: rpcErr } = await supabaseAdmin.rpc("setup_first_owner", {
        p_restaurant_name: restaurantName,
        p_slug: `${slug}-${Date.now().toString(36)}`,
        p_user_id: ownerUserId,
        p_username: cleanUsername,
      });

      if (!rpcErr && rpcRestaurantId) {
        restaurantId = rpcRestaurantId;
      } else {
        // If RPC reported setup already complete or constraint violation
        if (rpcErr?.message?.includes("already been completed")) {
          await supabaseAdmin.auth.admin.deleteUser(ownerUserId);
          return jsonResponse({ error: "Setup has already been completed. New owners cannot be registered here." }, 400);
        }

        // Resilient fallback to direct table transaction if RPC is unavailable
        const { data: existingRest } = await supabaseAdmin
          .from("restaurants")
          .select("id")
          .limit(1)
          .maybeSingle();

        if (existingRest?.id) {
          restaurantId = existingRest.id;
          if (restaurantName && restaurantName !== "Demo Restaurant") {
            await supabaseAdmin
              .from("restaurants")
              .update({ name: restaurantName })
              .eq("id", restaurantId);
          }
        } else {
          const { data: newRest, error: restErr } = await supabaseAdmin
            .from("restaurants")
            .insert({
              name: restaurantName,
              slug: `${slug}-${Date.now().toString(36)}`,
              is_active: true,
            })
            .select("id")
            .single();

          if (restErr || !newRest) {
            await supabaseAdmin.auth.admin.deleteUser(ownerUserId);
            return jsonResponse({ error: "Failed to initialize restaurant record." }, 500);
          }
          restaurantId = newRest.id;
        }

        const { error: ruInsertErr } = await supabaseAdmin
          .from("restaurant_users")
          .insert({
            restaurant_id: restaurantId,
            user_id: ownerUserId,
            username: cleanUsername,
            role: "owner",
            is_active: true,
          });

        if (ruInsertErr) {
          await supabaseAdmin.auth.admin.deleteUser(ownerUserId);
          return jsonResponse({ error: "Failed to persist owner profile." }, 500);
        }

        // Record audit log for setup
        try {
          await supabaseAdmin.from("audit_logs").insert({
            restaurant_id: restaurantId,
            user_id: ownerUserId,
            action: "INSERT",
            entity_type: "restaurant_users",
            entity_id: ownerUserId,
            old_data: null,
            new_data: {
              username: cleanUsername,
              role: "owner",
              event: "Initial setup wizard completed",
            },
          });
        } catch {
          // Audit log recording is non-blocking on setup completion
        }
      }

      return jsonResponse({
        success: true,
        message: "Initial setup wizard completed successfully.",
        restaurant_id: restaurantId,
        username: cleanUsername,
      });
    }

    // ========================================================
    // 3. LOGIN
    // ========================================================
    if (action === "login") {
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";

      if (!username || !password) {
        return jsonResponse({ error: "Username and password are required." }, 400);
      }

      // Look up candidates in restaurant_users by username (case-insensitive)
      let ruQuery = supabaseAdmin
        .from("restaurant_users")
        .select("*")
        .ilike("username", username);

      if (typeof body.restaurant_id === "string" && body.restaurant_id.trim()) {
        ruQuery = ruQuery.eq("restaurant_id", body.restaurant_id.trim());
      }

      const { data: ruCandidates, error: ruError } = await ruQuery;

      if (ruError || !ruCandidates || ruCandidates.length === 0) {
        return jsonResponse({ error: "Invalid username or password." }, 401);
      }

      let authenticatedRu = null;
      let authenticatedSession = null;
      let hasInactiveMatch = false;

      // Authenticate across candidate accounts
      for (const candidate of ruCandidates) {
        const { data: authUserRes, error: authUserError } =
          await supabaseAdmin.auth.admin.getUserById(candidate.user_id);

        if (authUserError || !authUserRes?.user?.email) continue;

        const internalEmail = authUserRes.user.email;
        const { data: sessionData, error: signInError } =
          await supabaseAnon.auth.signInWithPassword({
            email: internalEmail,
            password,
          });

        if (!signInError && sessionData?.session) {
          if (!candidate.is_active) {
            hasInactiveMatch = true;
            continue;
          }
          authenticatedRu = candidate;
          authenticatedSession = sessionData.session;
          break;
        }
      }

      if (hasInactiveMatch && !authenticatedRu) {
        return jsonResponse(
          { error: "Account is inactive. Please contact the restaurant owner." },
          403
        );
      }

      if (!authenticatedRu || !authenticatedSession) {
        return jsonResponse({ error: "Invalid username or password." }, 401);
      }

      // Return authenticated session to client (internal email is NOT exposed)
      return jsonResponse({
        session: authenticatedSession,
        user: {
          user_id: authenticatedRu.user_id,
          restaurant_id: authenticatedRu.restaurant_id,
          username: authenticatedRu.username,
          role: authenticatedRu.role,
        },
      });
    }

    // ========================================================
    // 4. CREATE ADMIN (Owner Only)
    // ========================================================
    if (action === "create_admin") {
      const ownerCheck = await verifyOwner(req, supabaseAdmin);
      if (!ownerCheck.isOwner || !ownerCheck.restaurantId || !ownerCheck.user) {
        return jsonResponse({ error: ownerCheck.error ?? "Unauthorized" }, ownerCheck.status ?? 403);
      }

      const restaurantId = ownerCheck.restaurantId;
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const permissions = Array.isArray(body.permissions) ? body.permissions : [];

      if (!username || !password) {
        return jsonResponse({ error: "Incomplete details provided." }, 400);
      }

      const cleanUsername = username.toLowerCase();
      if (
        cleanUsername.length < 3 ||
        cleanUsername.length > 30 ||
        !/^[a-zA-Z0-9_]+$/.test(cleanUsername)
      ) {
        return jsonResponse(
          { error: "Username must be 3-30 characters long and contain only letters, numbers, and underscores." },
          400
        );
      }

      if (password.length < 8) {
        return jsonResponse({ error: "Password must be at least 8 characters long." }, 400);
      }

      // Check username uniqueness within this specific restaurant
      const { data: existingUser } = await supabaseAdmin
        .from("restaurant_users")
        .select("user_id")
        .eq("restaurant_id", restaurantId)
        .ilike("username", cleanUsername)
        .maybeSingle();

      if (existingUser) {
        return jsonResponse({ error: "Username is already in use." }, 400);
      }

      // Create Supabase Auth user with random internal identifier (decoupled from username)
      const internalEmail = `admin_${crypto.randomUUID()}@auth.local`;
      const { data: newAuthData, error: createAuthError } =
        await supabaseAdmin.auth.admin.createUser({
          email: internalEmail,
          password,
          email_confirm: true,
        });

      if (createAuthError || !newAuthData?.user) {
        return jsonResponse(
          { error: createAuthError?.message || "Failed to create authentication user." },
          500
        );
      }

      const newAuthUserId = newAuthData.user.id;

      // Create restaurant_users record
      const { data: newRu, error: insertRuError } = await supabaseAdmin
        .from("restaurant_users")
        .insert({
          restaurant_id: restaurantId,
          user_id: newAuthUserId,
          username: cleanUsername,
          role: "admin",
          is_active: true,
        })
        .select()
        .single();

      if (insertRuError || !newRu) {
        await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
        return jsonResponse({ error: "Failed to persist administrator profile." }, 500);
      }

      // Validate and insert admin permissions
      const VALID_PERMISSIONS = new Set([
        "view_categories", "create_categories", "update_categories", "delete_categories",
        "view_products", "create_products", "update_products", "delete_products",
        "view_variants", "create_variants", "update_variants", "delete_variants",
        "manage_admins", "view_audit_logs",
      ]);
      const safePermissions = permissions.filter(
        (p: unknown): p is string => typeof p === "string" && VALID_PERMISSIONS.has(p)
      );

      if (safePermissions.length > 0) {
        const permRows = safePermissions.map((p: string) => ({
          restaurant_id: restaurantId,
          user_id: newAuthUserId,
          permission: p,
        }));
        await supabaseAdmin.from("admin_permissions").insert(permRows);
      }

      // Record audit log for admin creation
      try {
        await supabaseAdmin.from("audit_logs").insert({
          restaurant_id: restaurantId,
          user_id: ownerCheck.user.id,
          action: "INSERT",
          entity_type: "restaurant_users",
          entity_id: newAuthUserId,
          old_data: null,
          new_data: {
            user_id: newAuthUserId,
            username: cleanUsername,
            role: "admin",
            is_active: true,
            permissions: safePermissions,
          },
        });
      } catch {
        // Non-blocking audit record
      }

      return jsonResponse({
        success: true,
        user: {
          user_id: newRu.user_id,
          username: newRu.username,
          role: newRu.role,
        },
      });
    }

    // ========================================================
    // 5. CHANGE PASSWORD (Owner Only)
    // ========================================================
    if (action === "change_password") {
      const ownerCheck = await verifyOwner(req, supabaseAdmin);
      if (!ownerCheck.isOwner || !ownerCheck.restaurantId || !ownerCheck.user) {
        return jsonResponse({ error: ownerCheck.error ?? "Unauthorized" }, ownerCheck.status ?? 403);
      }

      const restaurantId = ownerCheck.restaurantId;
      const targetUserId =
        typeof body.target_user_id === "string" ? body.target_user_id : "";
      const password = typeof body.password === "string" ? body.password : "";

      if (!targetUserId || !password || password.length < 8) {
        return jsonResponse({ error: "Password must be at least 8 characters long." }, 400);
      }

      // Find target user in restaurant_users within the same restaurant
      const { data: targetRu, error: targetRuError } = await supabaseAdmin
        .from("restaurant_users")
        .select("user_id, username")
        .eq("restaurant_id", restaurantId)
        .eq("user_id", targetUserId)
        .single();

      if (targetRuError || !targetRu) {
        return jsonResponse({ error: "User not found." }, 404);
      }

      const targetAuthId = targetRu.user_id;

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        targetAuthId,
        { password }
      );

      if (updateError) {
        return jsonResponse({ error: "Failed to update password." }, 500);
      }

      // Record audit log for password change
      try {
        await supabaseAdmin.from("audit_logs").insert({
          restaurant_id: restaurantId,
          user_id: ownerCheck.user.id,
          action: "UPDATE",
          entity_type: "restaurant_users",
          entity_id: targetAuthId,
          old_data: { username: targetRu.username, event: "Password update requested" },
          new_data: { username: targetRu.username, event: "Password updated successfully" },
        });
      } catch {
        // Non-blocking audit record
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Invalid action." }, 400);
  } catch (err: unknown) {
    console.error("Internal error in admin-auth:", err);
    return jsonResponse({ error: "An unexpected server error occurred." }, 500);
  }
});
