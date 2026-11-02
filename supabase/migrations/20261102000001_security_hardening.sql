-- ============================================================
-- SECURITY HARDENING MIGRATION
-- Abu Nagy Restaurant Management System
-- Applied: 2026-11-02
--
-- Contents:
-- 1. Persistent, Distributed Rate Limiting Table & Function
-- 2. Function Execution Privilege Revocations & Grants
-- 3. Search Path Hardening
-- 4. Table-Level Privilege Hardening
-- ============================================================

-- ============================================================
-- 1. PERSISTENT DISTRIBUTED RATE LIMITING
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON public.rate_limits (key);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits (window_start);

-- Rate limits table must be strictly invisible to PostgREST clients.
-- Enable RLS with zero client policies.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.rate_limits FROM anon;
REVOKE ALL ON TABLE public.rate_limits FROM authenticated;
GRANT ALL ON TABLE public.rate_limits TO service_role;

-- Atomic sliding-window rate limit checker
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_lockout_seconds integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_now timestamptz := now();
  v_remaining_lockout integer;
  v_window_interval interval := (p_window_seconds || ' seconds')::interval;
  v_lockout_interval interval := (p_lockout_seconds || ' seconds')::interval;
BEGIN
  -- Opportunistic cleanup of expired records older than 1 day
  DELETE FROM public.rate_limits 
  WHERE window_start < (v_now - interval '1 day') 
    AND (locked_until IS NULL OR locked_until < v_now);

  SELECT * INTO v_rec
  FROM public.rate_limits
  WHERE key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (key, attempts, window_start, locked_until)
    VALUES (p_key, 1, v_now, NULL);

    RETURN jsonb_build_object(
      'allowed', true,
      'remaining_attempts', GREATEST(p_max_attempts - 1, 0),
      'retry_after', 0
    );
  END IF;

  -- Check if currently locked out
  IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until > v_now THEN
    v_remaining_lockout := CEIL(EXTRACT(EPOCH FROM (v_rec.locked_until - v_now)))::integer;
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining_attempts', 0,
      'retry_after', v_remaining_lockout
    );
  END IF;

  -- Check if current window has expired
  IF v_now > (v_rec.window_start + v_window_interval) THEN
    UPDATE public.rate_limits
    SET attempts = 1,
        window_start = v_now,
        locked_until = NULL
    WHERE key = p_key;

    RETURN jsonb_build_object(
      'allowed', true,
      'remaining_attempts', GREATEST(p_max_attempts - 1, 0),
      'retry_after', 0
    );
  END IF;

  -- Window is still active: check attempt limit
  IF v_rec.attempts >= p_max_attempts THEN
    IF p_lockout_seconds > 0 THEN
      UPDATE public.rate_limits
      SET locked_until = v_now + v_lockout_interval
      WHERE key = p_key;

      RETURN jsonb_build_object(
        'allowed', false,
        'remaining_attempts', 0,
        'retry_after', p_lockout_seconds
      );
    ELSE
      v_remaining_lockout := CEIL(EXTRACT(EPOCH FROM ((v_rec.window_start + v_window_interval) - v_now)))::integer;
      RETURN jsonb_build_object(
        'allowed', false,
        'remaining_attempts', 0,
        'retry_after', GREATEST(v_remaining_lockout, 1)
      );
    END IF;
  END IF;

  -- Increment attempts
  UPDATE public.rate_limits
  SET attempts = attempts + 1
  WHERE key = p_key;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining_attempts', GREATEST(p_max_attempts - (v_rec.attempts + 1), 0),
    'retry_after', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer, integer) TO service_role;

-- ============================================================
-- 2. FUNCTION PRIVILEGE HARDENING
-- ============================================================

-- is_owner() — called from RLS policies by the authenticated role
REVOKE ALL ON FUNCTION public.is_owner(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_owner(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated;

-- has_permission() — called from RLS policies by the authenticated role
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;

-- setup_first_owner() — strictly reserved for service_role Edge Function
REVOKE ALL ON FUNCTION public.setup_first_owner(text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.setup_first_owner(text, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.setup_first_owner(text, text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.setup_first_owner(text, text, uuid, text) TO service_role;

-- Trigger functions: ensure explicit search_path and revoke public execution
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_audit_event() FROM PUBLIC;

-- ============================================================
-- 3. TABLE-LEVEL PRIVILEGE HARDENING
-- ============================================================

-- Explicitly ensure anonymous role cannot perform state modifications
REVOKE INSERT, UPDATE, DELETE ON public.restaurants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.restaurant_users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.categories FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_variants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_permissions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon;

-- Audit logs: clients must never be able to INSERT, UPDATE, or DELETE
-- audit records directly; all writes are performed via SECURITY DEFINER
-- triggers or the service_role Edge Function client.
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
