import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Dynamic CORS & Origin Allowlist
// ---------------------------------------------------------------------------
function getAllowedOrigins(): string[] {
  const localDefaults = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];

  const origins = new Set<string>(localDefaults);

  // Read production admin dashboard URL from Supabase Edge Function environment
  const adminUrl = Deno.env.get("ADMIN_DASHBOARD_URL");
  if (adminUrl) {
    const trimmed = adminUrl.trim().replace(/\/+$/, "");
    if (trimmed) origins.add(trimmed);
  }

  // Read comma-separated origins if configured
  const envAllowed = Deno.env.get("ALLOWED_ORIGINS");
  if (envAllowed) {
    envAllowed.split(",").forEach((item) => {
      const trimmed = item.trim().replace(/\/+$/, "");
      if (trimmed) origins.add(trimmed);
    });
  }

  return Array.from(origins);
}

function isOriginAllowed(requestOrigin: string | null): boolean {
  // Non-browser clients (curl, backend-to-backend) do not send Origin header
  if (!requestOrigin) return true;
  const allowed = getAllowedOrigins();
  return allowed.includes(requestOrigin);
}

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };

  // Only reflect origin if it matches our allowlist
  if (requestOrigin && isOriginAllowed(requestOrigin)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
  }

  return headers;
}

function jsonResponse(
  data: Record<string, unknown>,
  status = 200,
  requestOrigin: string | null = null,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeaders(requestOrigin),
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function serviceUnavailableResponse(requestOrigin: string | null = null) {
  return jsonResponse(
    {
      error: "Security verification service is temporarily unavailable. Please try again shortly.",
    },
    503,
    requestOrigin,
    { "Retry-After": "30" }
  );
}

function rateLimitResponse(retryAfter: number, requestOrigin: string | null = null) {
  return jsonResponse(
    {
      error: "Too many requests. Please try again later.",
      retry_after: retryAfter,
    },
    429,
    requestOrigin,
    { "Retry-After": String(retryAfter || 60) }
  );
}

// ---------------------------------------------------------------------------
// Client IP Extraction with Validation
// ---------------------------------------------------------------------------
function isValidIp(ip: string): boolean {
  const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv4.test(ip) || (ip.includes(":") && ipv6.test(ip));
}

function getClientIp(req: Request): string {
  // In Supabase Edge Functions on Cloudflare infrastructure, CF-Connecting-IP is
  // set directly by Cloudflare edge and cannot be forged by client request headers.
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp && isValidIp(cfConnectingIp.trim())) {
    return cfConnectingIp.trim();
  }

  // Trusted proxy real-ip header
  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp && isValidIp(xRealIp.trim())) {
    return xRealIp.trim();
  }

  // Fallback to x-forwarded-for: inspect entries from right-to-left (nearest proxy hop)
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const parts = xForwardedFor.split(",").map((p) => p.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (isValidIp(parts[i])) {
        return parts[i];
      }
    }
  }

  return "unknown-client";
}

// ---------------------------------------------------------------------------
// Persistent Distributed Rate Limiting (FAIL-CLOSED)
// ---------------------------------------------------------------------------
type RateLimitStatus =
  | { status: "allowed"; remaining_attempts: number; retry_after: 0 }
  | { status: "rate_limited"; remaining_attempts: 0; retry_after: number }
  | { status: "unavailable"; error_message: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkRateLimit(
  supabaseAdmin: any,
  key: string,
  maxAttempts: number,
  windowSeconds: number,
  lockoutSeconds = 0
): Promise<RateLimitStatus> {
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      p_key: key,
      p_max_attempts: maxAttempts,
      p_window_seconds: windowSeconds,
      p_lockout_seconds: lockoutSeconds,
    });

    if (error) {
      console.error(`[SECURITY RATE-LIMIT ERROR] Key [${key}]: ${error.message}`);
      return { status: "unavailable", error_message: error.message };
    }

    if (!data || typeof data.allowed !== "boolean") {
      console.error(`[SECURITY RATE-LIMIT ERROR] Malformed response for key [${key}]`);
      return { status: "unavailable", error_message: "Malformed response" };
    }

    if (data.allowed) {
      return {
        status: "allowed",
        remaining_attempts: Number(data.remaining_attempts) || 0,
        retry_after: 0,
      };
    } else {
      return {
        status: "rate_limited",
        remaining_attempts: 0,
        retry_after: Number(data.retry_after) || 60,
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SECURITY RATE-LIMIT EXCEPTION] Key [${key}]: ${msg}`);
    return { status: "unavailable", error_message: msg };
  }
}

// ---------------------------------------------------------------------------
// verifyOwner — confirm caller is an active restaurant owner via JWT
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
// Main Handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");

  // 1. CORS Preflight Handling
  if (req.method === "OPTIONS") {
    if (requestOrigin && !isOriginAllowed(requestOrigin)) {
      return new Response("CORS origin forbidden", { status: 403 });
    }
    return new Response("ok", { headers: getCorsHeaders(requestOrigin) });
  }

  // 2. HTTP Method Validation
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405, requestOrigin);
  }

  // 3. Origin Rejection for POST requests from untrusted browser origins
  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return jsonResponse({ error: "Unauthorized request origin." }, 403, requestOrigin);
  }

  // 4. Content-Type Validation
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { error: "Unsupported Media Type. Content-Type must be application/json." },
      415,
      requestOrigin
    );
  }

  // 5. Payload Size Protection (Max 64 KB)
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!isNaN(contentLength) && contentLength > 65536) {
      return jsonResponse({ error: "Payload too large. Max request size is 64KB." }, 413, requestOrigin);
    }
  }

  // 6. Environment & Supabase Client Initialization
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return jsonResponse({ error: "Server configuration missing." }, 500, requestOrigin);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
  const clientIp = getClientIp(req);

  // 7. Request Body Parsing
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body format." }, 400, requestOrigin);
  }

  const ALLOWED_ACTIONS = new Set([
    "check_setup_status",
    "setup_initial_owner",
    "login",
    "create_admin",
    "change_password",
  ]);

  const { action } = body;
  if (!action || typeof action !== "string" || !ALLOWED_ACTIONS.has(action)) {
    return jsonResponse({ error: "Invalid or unsupported action." }, 400, requestOrigin);
  }

  try {
    // ========================================================
    // 1. CHECK SETUP STATUS (Public / Read-Only / Fail-Closed)
    // ========================================================
    if (action === "check_setup_status") {
      const ipRl = await checkRateLimit(supabaseAdmin, `status:ip:${clientIp}`, 60, 60);
      if (ipRl.status === "rate_limited") {
        return rateLimitResponse(ipRl.retry_after, requestOrigin);
      }
      if (ipRl.status === "unavailable") {
        // Fail-closed: triggers error boundary in frontend, preventing setup form exposure
        return serviceUnavailableResponse(requestOrigin);
      }

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
      // Fail-closed persistent rate limiting: max 5 setup attempts per 10 minutes per IP
      const setupRl = await checkRateLimit(
        supabaseAdmin,
        `setup:ip:${clientIp}`,
        5,
        600,
        1800
      );
      if (setupRl.status === "rate_limited") {
        return rateLimitResponse(setupRl.retry_after, requestOrigin);
      }
      if (setupRl.status === "unavailable") {
        return serviceUnavailableResponse(requestOrigin);
      }

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

      // Create Supabase Auth user with random internal identifier
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

      // Atomically link owner and restaurant via setup_first_owner RPC
      // The RPC takes pg_advisory_xact_lock(742918451) and re-verifies owner count.
      // There is NO direct-insert fallback.
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
        // Rollback: purge the orphaned Auth user on RPC failure
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
    // 3. LOGIN (Dual-Keyed Fail-Closed Rate Limiting)
    // ========================================================
    if (action === "login") {
      // 1. IP-level rate limit (20 requests per minute)
      const ipRl = await checkRateLimit(supabaseAdmin, `login:ip:${clientIp}`, 20, 60);
      if (ipRl.status === "rate_limited") {
        return rateLimitResponse(ipRl.retry_after, requestOrigin);
      }
      if (ipRl.status === "unavailable") {
        return serviceUnavailableResponse(requestOrigin);
      }

      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";

      if (!username || !password) {
        return jsonResponse(
          { error: "Username and password are required." },
          400,
          requestOrigin
        );
      }

      const cleanUsername = username.toLowerCase();

      // 2. Account-level rate limiting: max 5 failed attempts per 5 minutes, 15m lockout
      const userRlKey = `login:user:${cleanUsername}`;

      // Look up candidate accounts in restaurant_users (case-insensitive)
      let ruQuery = supabaseAdmin
        .from("restaurant_users")
        .select("*")
        .ilike("username", cleanUsername);

      if (typeof body.restaurant_id === "string" && body.restaurant_id.trim()) {
        ruQuery = ruQuery.eq("restaurant_id", body.restaurant_id.trim());
      }

      const { data: ruCandidates, error: ruError } = await ruQuery;

      if (ruError || !ruCandidates || ruCandidates.length === 0) {
        // Register failed attempt without leaking username non-existence
        const userRl = await checkRateLimit(supabaseAdmin, userRlKey, 5, 300, 900);
        if (userRl.status === "rate_limited") {
          return rateLimitResponse(userRl.retry_after, requestOrigin);
        }
        if (userRl.status === "unavailable") {
          return serviceUnavailableResponse(requestOrigin);
        }
        return jsonResponse({ error: "Invalid username or password." }, 401, requestOrigin);
      }

      let authenticatedRu = null;
      let authenticatedSession = null;
      let hasInactiveMatch = false;

      // Authenticate against candidates
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
        // Increment failed attempt counter on bad password
        const userRl = await checkRateLimit(supabaseAdmin, userRlKey, 5, 300, 900);
        if (userRl.status === "rate_limited") {
          return rateLimitResponse(userRl.retry_after, requestOrigin);
        }
        if (userRl.status === "unavailable") {
          return serviceUnavailableResponse(requestOrigin);
        }
        return jsonResponse({ error: "Invalid username or password." }, 401, requestOrigin);
      }

      // Return session data; internal email is NEVER returned to client
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
    // 4. CREATE ADMIN (Owner Only / Fail-Closed Rate Limiting)
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

      // Rate limit admin creations: max 15 per 10 minutes per owner
      const adminCreateRl = await checkRateLimit(
        supabaseAdmin,
        `create_admin:owner:${ownerCheck.user.id}`,
        15,
        600
      );
      if (adminCreateRl.status === "rate_limited") {
        return rateLimitResponse(adminCreateRl.retry_after, requestOrigin);
      }
      if (adminCreateRl.status === "unavailable") {
        return serviceUnavailableResponse(requestOrigin);
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

      // Create Supabase Auth user with internal identifier
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

      // Create restaurant_users row
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

      // Validate and insert admin permissions against strict allowlist
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

      // Record audit log
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
    // 5. CHANGE PASSWORD (Owner Only / Fail-Closed Rate Limiting)
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

      // Rate limit password changes: max 15 per 10 minutes per owner
      const pwChangeRl = await checkRateLimit(
        supabaseAdmin,
        `change_pw:owner:${ownerCheck.user.id}`,
        15,
        600
      );
      if (pwChangeRl.status === "rate_limited") {
        return rateLimitResponse(pwChangeRl.retry_after, requestOrigin);
      }
      if (pwChangeRl.status === "unavailable") {
        return serviceUnavailableResponse(requestOrigin);
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

      // Verify target user belongs to same restaurant
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

      // Record audit log
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
    const errorMsg = err instanceof Error ? err.message : "Unexpected server error";
    console.error(`[SECURITY UNEXPECTED ERROR] Action [${action}]: ${errorMsg}`);
    return jsonResponse(
      { error: "An unexpected server error occurred." },
      500,
      requestOrigin
    );
  }
});
