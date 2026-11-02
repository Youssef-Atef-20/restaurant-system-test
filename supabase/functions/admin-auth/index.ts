import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS — explicit origin allowlist.
// The customer menu never calls this function (it uses the public REST API).
// Wildcard CORS on a privileged endpoint allows any website to issue
// authenticated administrative requests from a victim's browser session.
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = [
  // Production admin dashboard — set ADMIN_DASHBOARD_URL in Supabase Edge Function secrets
  // and replace the placeholder below with your actual Vercel deployment URL.
  "https://admin.yourdomain.com",
  // Local development
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  // Reflect the origin only if it is in the allowlist.
  // Non-listed origins receive the first entry, which will not match their
  // actual origin and the browser will block the preflight.
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(
  data: Record<string, unknown>,
  status = 200,
  requestOrigin: string | null = null
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeaders(requestOrigin),
      "Content-Type": "application/json",
    },
  });
}

// ---------------------------------------------------------------------------
// verifyOwner — confirm the caller is an active restaurant owner.
// Uses the admin client to cryptographically verify the JWT via getUser().
// ---------------------------------------------------------------------------
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

  // Verify active owner in restaurant_users
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

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(requestOrigin) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, requestOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return jsonResponse({ error: "Server configuration missing" }, 500, requestOrigin);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, requestOrigin);
  }

  const { action } = body;

  try {
    // ========================================================
    // 1. CHECK SETUP STATUS (Public / Unauthenticated)
    // ========================================================
    if (action === "check_setup_status") {
      const { count, error: countErr } = await supabaseAdmin
        .from("restaurant_users")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "owner");

      if (countErr) {
        return jsonResponse({ error: "Failed to determine setup status." }, 500, requestOrigin);
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

      return jsonResponse(
        { is_setup_required: isSetupRequired, restaurant_name: restaurantName },
        200,
        requestOrigin
      );
    }

    // ========================================================
    // 2. SETUP INITIAL OWNER (Protected First-Time Setup Wizard)
    // ========================================================
    if (action === "setup_initial_owner") {
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const restaurantName =
        typeof body.restaurant_name === "string"
          ? body.restaurant_name.trim()
          : "Demo Restaurant";

      if (!username || !password) {
        return jsonResponse(
          { error: "Username and password are required." },
          400,
          requestOrigin
        );
      }

      const cleanUsername = username.toLowerCase();
      if (
        cleanUsername.length < 3 ||
        cleanUsername.length > 30 ||
        !/^[a-zA-Z0-9_]+$/.test(cleanUsername)
      ) {
        return jsonResponse(
          {
            error:
              "Username must be 3-30 characters long and contain only letters, numbers, and underscores.",
          },
          400,
          requestOrigin
        );
      }

      if (password.length < 8) {
        return jsonResponse(
          { error: "Password must be at least 8 characters long." },
          400,
          requestOrigin
        );
      }

      // 1. Create Supabase Auth user with a random internal identifier.
      //    The internal email is never exposed to the frontend.
      const internalEmail = `owner_${crypto.randomUUID()}@auth.local`;
      const { data: newAuthData, error: createAuthError } =
        await supabaseAdmin.auth.admin.createUser({
          email: internalEmail,
          password,
          email_confirm: true,
        });

      if (createAuthError || !newAuthData?.user) {
        return jsonResponse(
          { error: createAuthError?.message || "Failed to create authentication user." },
          500,
          requestOrigin
        );
      }

      const ownerUserId = newAuthData.user.id;

      // 2. Atomically link owner & restaurant via the dedicated database function.
      //
      //    setup_first_owner:
      //    - Acquires a transaction-level advisory lock (pg_advisory_xact_lock) to
      //      prevent concurrent setup races.
      //    - Re-checks the owner count inside the transaction.
      //    - Raises an exception if setup is already complete.
      //    - Inserts the restaurant row (or updates the existing seed row) and the
      //      restaurant_users owner row atomically.
      //
      //    There is NO fallback path. If the RPC fails for ANY reason — already
      //    complete, constraint violation, DB error, or anything else — we clean up
      //    the orphaned auth user and return a safe error to the caller.
      const slug =
        restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ||
        "restaurant";

      const { data: rpcRestaurantId, error: rpcErr } = await supabaseAdmin.rpc(
        "setup_first_owner",
        {
          p_restaurant_name: restaurantName,
          p_slug: `${slug}-${Date.now().toString(36)}`,
          p_user_id: ownerUserId,
          p_username: cleanUsername,
        }
      );

      if (rpcErr || !rpcRestaurantId) {
        // Always clean up the orphaned auth user on any RPC failure.
        await supabaseAdmin.auth.admin.deleteUser(ownerUserId);

        if (rpcErr?.message?.includes("already been completed")) {
          return jsonResponse(
            {
              error:
                "Setup has already been completed. New owners cannot be registered here.",
            },
            400,
            requestOrigin
          );
        }
        // Surface DB validation errors (e.g. username length) but redact internal details.
        const safeMessage =
          rpcErr?.message?.includes("Username must be")
            ? rpcErr.message
            : "Failed to complete setup. Please try again.";
        return jsonResponse({ error: safeMessage }, 500, requestOrigin);
      }

      return jsonResponse(
        {
          success: true,
          message: "Initial setup wizard completed successfully.",
          restaurant_id: rpcRestaurantId,
          username: cleanUsername,
        },
        200,
        requestOrigin
      );
    }

    // ========================================================
    // 3. LOGIN
    // ========================================================
    if (action === "login") {
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";

      if (!username || !password) {
        return jsonResponse(
          { error: "Username and password are required." },
          400,
          requestOrigin
        );
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
        return jsonResponse({ error: "Invalid username or password." }, 401, requestOrigin);
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
          403,
          requestOrigin
        );
      }

      if (!authenticatedRu || !authenticatedSession) {
        return jsonResponse({ error: "Invalid username or password." }, 401, requestOrigin);
      }

      // Return authenticated session to client (internal email is NOT exposed)
      return jsonResponse(
        {
          session: authenticatedSession,
          user: {
            user_id: authenticatedRu.user_id,
            restaurant_id: authenticatedRu.restaurant_id,
            username: authenticatedRu.username,
            role: authenticatedRu.role,
          },
        },
        200,
        requestOrigin
      );
    }

    // ========================================================
    // 4. CREATE ADMIN (Owner Only)
    // ========================================================
    if (action === "create_admin") {
      const ownerCheck = await verifyOwner(req, supabaseAdmin);
      if (!ownerCheck.isOwner || !ownerCheck.restaurantId || !ownerCheck.user) {
        return jsonResponse(
          { error: ownerCheck.error ?? "Unauthorized" },
          ownerCheck.status ?? 403,
          requestOrigin
        );
      }

      const restaurantId = ownerCheck.restaurantId;
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const permissions = Array.isArray(body.permissions) ? body.permissions : [];

      if (!username || !password) {
        return jsonResponse(
          { error: "Incomplete details provided." },
          400,
          requestOrigin
        );
      }

      const cleanUsername = username.toLowerCase();
      if (
        cleanUsername.length < 3 ||
        cleanUsername.length > 30 ||
        !/^[a-zA-Z0-9_]+$/.test(cleanUsername)
      ) {
        return jsonResponse(
          {
            error:
              "Username must be 3-30 characters long and contain only letters, numbers, and underscores.",
          },
          400,
          requestOrigin
        );
      }

      if (password.length < 8) {
        return jsonResponse(
          { error: "Password must be at least 8 characters long." },
          400,
          requestOrigin
        );
      }

      // Check username uniqueness within this restaurant
      const { data: existingUser } = await supabaseAdmin
        .from("restaurant_users")
        .select("user_id")
        .eq("restaurant_id", restaurantId)
        .ilike("username", cleanUsername)
        .maybeSingle();

      if (existingUser) {
        return jsonResponse({ error: "Username is already in use." }, 400, requestOrigin);
      }

      // Create Supabase Auth user with a random internal identifier
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
          500,
          requestOrigin
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
        return jsonResponse(
          { error: "Failed to persist administrator profile." },
          500,
          requestOrigin
        );
      }

      // Validate and insert admin permissions against an explicit allowlist
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

      // Record audit log (non-blocking)
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
        // Non-blocking
      }

      return jsonResponse(
        {
          success: true,
          user: {
            user_id: newRu.user_id,
            username: newRu.username,
            role: newRu.role,
          },
        },
        200,
        requestOrigin
      );
    }

    // ========================================================
    // 5. CHANGE PASSWORD (Owner Only)
    // ========================================================
    if (action === "change_password") {
      const ownerCheck = await verifyOwner(req, supabaseAdmin);
      if (!ownerCheck.isOwner || !ownerCheck.restaurantId || !ownerCheck.user) {
        return jsonResponse(
          { error: ownerCheck.error ?? "Unauthorized" },
          ownerCheck.status ?? 403,
          requestOrigin
        );
      }

      const restaurantId = ownerCheck.restaurantId;
      const targetUserId =
        typeof body.target_user_id === "string" ? body.target_user_id : "";
      const password = typeof body.password === "string" ? body.password : "";

      if (!targetUserId || !password || password.length < 8) {
        return jsonResponse(
          { error: "Password must be at least 8 characters long." },
          400,
          requestOrigin
        );
      }

      // Verify target user belongs to the same restaurant
      const { data: targetRu, error: targetRuError } = await supabaseAdmin
        .from("restaurant_users")
        .select("user_id, username")
        .eq("restaurant_id", restaurantId)
        .eq("user_id", targetUserId)
        .single();

      if (targetRuError || !targetRu) {
        return jsonResponse({ error: "User not found." }, 404, requestOrigin);
      }

      const targetAuthId = targetRu.user_id;

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        targetAuthId,
        { password }
      );

      if (updateError) {
        return jsonResponse({ error: "Failed to update password." }, 500, requestOrigin);
      }

      // Record audit log (non-blocking)
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
        // Non-blocking
      }

      return jsonResponse({ success: true }, 200, requestOrigin);
    }

    return jsonResponse({ error: "Invalid action." }, 400, requestOrigin);
  } catch (err: unknown) {
    console.error("Internal error in admin-auth:", err);
    return jsonResponse(
      { error: "An unexpected server error occurred." },
      500,
      requestOrigin
    );
  }
});
