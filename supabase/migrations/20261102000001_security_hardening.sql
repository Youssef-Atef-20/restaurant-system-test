-- ============================================================
-- SECURITY HARDENING MIGRATION
-- Applied: 2026-11-02
-- Purpose: Tighten function execution privileges.
--          All legitimate application callers already have the
--          minimum permissions required — this migration only
--          ensures PUBLIC is not inadvertently granted execute
--          on functions that must stay restricted.
-- ============================================================

-- is_owner() — called from RLS policies by the authenticated role.
-- anon must NOT call this; PUBLIC must NOT inherit it.
REVOKE ALL ON FUNCTION public.is_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated;

-- has_permission() — same as is_owner().
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;

-- setup_first_owner() — must only run via the Edge Function's service_role client.
-- Already revoked in initial migration; repeated here for defence-in-depth.
REVOKE ALL ON FUNCTION public.setup_first_owner(text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.setup_first_owner(text, text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.setup_first_owner(text, text, uuid, text) TO service_role;

-- set_updated_at() — trigger function; executed by the trigger owner, not by roles directly.
-- Revoke public execute to be explicit.
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;

-- log_audit_event() — trigger function; executed by the trigger owner, not by roles directly.
-- Revoke public execute to be explicit.
REVOKE ALL ON FUNCTION public.log_audit_event() FROM PUBLIC;

-- ============================================================
-- ADDITIONAL TABLE-LEVEL HARDENING
-- ============================================================

-- Ensure anon cannot write to any table.
-- (Supabase defaults already restrict this, but be explicit.)
REVOKE INSERT, UPDATE, DELETE ON public.restaurants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.restaurant_users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.categories FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_variants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_permissions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon;

-- Audit logs: clients must never be able to INSERT, UPDATE, or DELETE
-- audit records directly; all writes go through SECURITY DEFINER
-- triggers or the service_role Edge Function client.
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;

-- ============================================================
-- NOTE: The following require Supabase Dashboard changes
-- (not SQL-addressable from migrations):
--
-- 1. Set minimum_password_length = 8 in Auth settings.
--    The Edge Function enforces >= 8, but Auth itself defaults
--    to 6 (config.toml). Dashboard: Auth > Policies > Password.
--
-- 2. Disable public signups: enable_signup = false.
--    Dashboard: Auth > Providers > Email > Disable sign-ups.
--
-- 3. Update Edge Function secret ADMIN_DASHBOARD_URL with the
--    real Vercel deployment URL to restrict CORS properly.
-- ============================================================

