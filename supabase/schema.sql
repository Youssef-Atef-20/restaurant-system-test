-- ============================================================
-- RESTAURANT MANAGEMENT SYSTEM & DIGITAL MENU - FULL SCHEMA
-- Compatible with Supabase PostgreSQL (Standard & Cloud)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. TABLES
-- ============================================================

-- 1.1 RESTAURANTS
CREATE TABLE IF NOT EXISTS public.restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.2 RESTAURANT USERS (Owners & Administrators)
CREATE TABLE IF NOT EXISTS public.restaurant_users (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, user_id),
  CONSTRAINT uq_restaurant_username UNIQUE (restaurant_id, username)
);

-- Ensure strictly one owner per restaurant at database level
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_owner
ON public.restaurant_users (restaurant_id)
WHERE (role = 'owner');

-- 1.3 CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.4 PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1.5 PRODUCT VARIANTS & PRICES
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(10, 2) NOT NULL DEFAULT 0.00,
  sort_order integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.6 ADMIN PERMISSIONS
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, user_id, permission),
  CONSTRAINT fk_admin_perm_user FOREIGN KEY (restaurant_id, user_id)
    REFERENCES public.restaurant_users(restaurant_id, user_id) ON DELETE CASCADE
);

-- 1.7 AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON public.restaurants(slug);
CREATE INDEX IF NOT EXISTS idx_restaurants_active ON public.restaurants(is_active);

CREATE INDEX IF NOT EXISTS idx_restaurant_users_user ON public.restaurant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_users_lookup ON public.restaurant_users(restaurant_id, username);

CREATE INDEX IF NOT EXISTS idx_categories_restaurant_order ON public.categories(restaurant_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_active ON public.categories(restaurant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_products_restaurant_order ON public.products(restaurant_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_available ON public.products(restaurant_id, is_available);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_product_variants_available ON public.product_variants(product_id, is_available);

CREATE INDEX IF NOT EXISTS idx_admin_permissions_user ON public.admin_permissions(restaurant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_restaurant_created ON public.audit_logs(restaurant_id, created_at DESC);

-- ============================================================
-- 3. HELPER FUNCTIONS FOR SECURITY & RBAC
-- ============================================================

-- Check if current authenticated user is active owner of the restaurant
CREATE OR REPLACE FUNCTION public.is_owner(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_users
    WHERE restaurant_id = p_restaurant_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  );
$$;

-- Check if current user is owner or an admin with specific permission
CREATE OR REPLACE FUNCTION public.has_permission(p_restaurant_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = p_restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.is_active = true
      AND (
        ru.role = 'owner'
        OR EXISTS (
          SELECT 1 FROM public.admin_permissions ap
          WHERE ap.restaurant_id = p_restaurant_id
            AND ap.user_id = auth.uid()
            AND ap.permission = p_permission
        )
      )
  );
$$;

-- Atomic, race-condition protected setup function for initial owner
CREATE OR REPLACE FUNCTION public.setup_first_owner(
  p_restaurant_name text,
  p_slug text,
  p_user_id uuid,
  p_username text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_count integer;
  v_restaurant_id uuid;
  v_clean_username text;
  v_clean_name text;
  v_slug text;
BEGIN
  -- Transaction-level advisory lock guarantees serial execution of setup requests
  PERFORM pg_advisory_xact_lock(742918451);

  -- 1. Ensure no owner exists anywhere across the system
  SELECT COUNT(*) INTO v_owner_count
  FROM public.restaurant_users
  WHERE role = 'owner';

  IF v_owner_count > 0 THEN
    RAISE EXCEPTION 'Setup has already been completed. New owners cannot be registered.';
  END IF;

  v_clean_username := lower(trim(p_username));
  IF length(v_clean_username) < 3 OR length(v_clean_username) > 30 THEN
    RAISE EXCEPTION 'Username must be 3-30 characters long.';
  END IF;

  v_clean_name := coalesce(nullif(trim(p_restaurant_name), ''), 'Demo Restaurant');

  -- 2. Link with existing restaurant (e.g. from seed.sql) or create fresh
  SELECT id INTO v_restaurant_id
  FROM public.restaurants
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_restaurant_id IS NOT NULL THEN
    IF v_clean_name <> 'Demo Restaurant' THEN
      v_slug := lower(regexp_replace(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
      v_slug := trim(both '-' from v_slug);
      IF v_slug = '' THEN v_slug := 'restaurant'; END IF;

      IF EXISTS (SELECT 1 FROM public.restaurants WHERE slug = v_slug AND id <> v_restaurant_id) THEN
        v_slug := v_slug || '-' || floor(extract(epoch from now()))::text;
      END IF;

      UPDATE public.restaurants
      SET name = v_clean_name,
          slug = v_slug,
          is_active = true
      WHERE id = v_restaurant_id;
    END IF;
  ELSE
    v_slug := coalesce(nullif(trim(p_slug), ''), lower(regexp_replace(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g')));
    v_slug := trim(both '-' from v_slug);
    IF v_slug = '' THEN v_slug := 'restaurant'; END IF;

    IF EXISTS (SELECT 1 FROM public.restaurants WHERE slug = v_slug) THEN
      v_slug := v_slug || '-' || floor(extract(epoch from now()))::text;
    END IF;

    INSERT INTO public.restaurants (name, slug, is_active)
    VALUES (v_clean_name, v_slug, true)
    RETURNING id INTO v_restaurant_id;
  END IF;

  -- 3. Insert owner record in restaurant_users
  INSERT INTO public.restaurant_users (
    restaurant_id,
    user_id,
    username,
    role,
    is_active
  ) VALUES (
    v_restaurant_id,
    p_user_id,
    v_clean_username,
    'owner',
    true
  );

  -- 4. Record audit log
  INSERT INTO public.audit_logs (
    restaurant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    v_restaurant_id,
    p_user_id,
    'INSERT',
    'restaurant_users',
    p_user_id,
    null,
    jsonb_build_object(
      'username', v_clean_username,
      'role', 'owner',
      'event', 'Initial setup wizard completed'
    )
  );

  RETURN v_restaurant_id;
END;
$$;

-- Explicit permissions on helper and setup functions
GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.setup_first_owner(text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_first_owner(text, text, uuid, text) TO service_role;

-- Automatically update updated_at timestamp on products
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_products_updated_at ON public.products;
CREATE TRIGGER tr_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4. AUDIT LOGGING TRIGGER FUNCTION & TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid;
  v_entity_id uuid;
  v_user_id uuid;
  v_old_data jsonb := null;
  v_new_data jsonb := null;
BEGIN
  v_user_id := auth.uid();

  -- If called without an authenticated user on restaurant_users/admin_permissions,
  -- skip inserting from trigger because Edge Function explicitly records the audit log with the verified owner's ID.
  IF v_user_id IS NULL AND (TG_TABLE_NAME = 'restaurant_users' OR TG_TABLE_NAME = 'admin_permissions') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_TABLE_NAME = 'product_variants' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT p.restaurant_id INTO v_restaurant_id FROM public.products p WHERE p.id = OLD.product_id;
      v_entity_id := OLD.id;
      v_old_data := to_jsonb(OLD);
    ELSE
      SELECT p.restaurant_id INTO v_restaurant_id FROM public.products p WHERE p.id = NEW.product_id;
      v_entity_id := NEW.id;
      IF TG_OP = 'UPDATE' THEN v_old_data := to_jsonb(OLD); END IF;
      v_new_data := to_jsonb(NEW);
    END IF;
  ELSIF TG_TABLE_NAME = 'categories' OR TG_TABLE_NAME = 'products' THEN
    IF TG_OP = 'DELETE' THEN
      v_restaurant_id := OLD.restaurant_id;
      v_entity_id := OLD.id;
      v_old_data := to_jsonb(OLD);
    ELSE
      v_restaurant_id := NEW.restaurant_id;
      v_entity_id := NEW.id;
      IF TG_OP = 'UPDATE' THEN v_old_data := to_jsonb(OLD); END IF;
      v_new_data := to_jsonb(NEW);
    END IF;
  ELSIF TG_TABLE_NAME = 'restaurant_users' OR TG_TABLE_NAME = 'admin_permissions' THEN
    IF TG_OP = 'DELETE' THEN
      v_restaurant_id := OLD.restaurant_id;
      v_entity_id := OLD.user_id;
      v_old_data := to_jsonb(OLD);
    ELSE
      v_restaurant_id := NEW.restaurant_id;
      v_entity_id := NEW.user_id;
      IF TG_OP = 'UPDATE' THEN v_old_data := to_jsonb(OLD); END IF;
      v_new_data := to_jsonb(NEW);
    END IF;
  END IF;

  IF v_restaurant_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      restaurant_id,
      user_id,
      action,
      entity_type,
      entity_id,
      old_data,
      new_data,
      created_at
    ) VALUES (
      v_restaurant_id,
      v_user_id,
      TG_OP,
      TG_TABLE_NAME,
      v_entity_id,
      v_old_data,
      v_new_data,
      now()
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Triggers for audit logging
DROP TRIGGER IF EXISTS audit_categories_trigger ON public.categories;
CREATE TRIGGER audit_categories_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_products_trigger ON public.products;
CREATE TRIGGER audit_products_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_product_variants_trigger ON public.product_variants;
CREATE TRIGGER audit_product_variants_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_restaurant_users_trigger ON public.restaurant_users;
CREATE TRIGGER audit_restaurant_users_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.restaurant_users
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_admin_permissions_trigger ON public.admin_permissions;
CREATE TRIGGER audit_admin_permissions_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.admin_permissions
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- ============================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 5.1 RESTAURANTS POLICIES
DROP POLICY IF EXISTS "Public can view active restaurants" ON public.restaurants;
CREATE POLICY "Public can view active restaurants"
ON public.restaurants
FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  OR is_owner(id)
  OR EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = restaurants.id
      AND ru.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Owners can update restaurant" ON public.restaurants;
CREATE POLICY "Owners can update restaurant"
ON public.restaurants
FOR UPDATE
TO authenticated
USING (is_owner(id))
WITH CHECK (is_owner(id));

-- 5.2 CATEGORIES POLICIES
DROP POLICY IF EXISTS "Public can view active categories" ON public.categories;
CREATE POLICY "Public can view active categories"
ON public.categories
FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = categories.restaurant_id AND r.is_active = true
  )
);

DROP POLICY IF EXISTS "Staff can view categories" ON public.categories;
CREATE POLICY "Staff can view categories"
ON public.categories
FOR SELECT
TO authenticated
USING (is_owner(restaurant_id) OR has_permission(restaurant_id, 'view_categories'));

DROP POLICY IF EXISTS "Staff can create categories" ON public.categories;
CREATE POLICY "Staff can create categories"
ON public.categories
FOR INSERT
TO authenticated
WITH CHECK (is_owner(restaurant_id) OR has_permission(restaurant_id, 'create_categories'));

DROP POLICY IF EXISTS "Staff can update categories" ON public.categories;
CREATE POLICY "Staff can update categories"
ON public.categories
FOR UPDATE
TO authenticated
USING (is_owner(restaurant_id) OR has_permission(restaurant_id, 'update_categories'))
WITH CHECK (is_owner(restaurant_id) OR has_permission(restaurant_id, 'update_categories'));

DROP POLICY IF EXISTS "Staff can delete categories" ON public.categories;
CREATE POLICY "Staff can delete categories"
ON public.categories
FOR DELETE
TO authenticated
USING (is_owner(restaurant_id) OR has_permission(restaurant_id, 'delete_categories'));

-- 5.3 PRODUCTS POLICIES
DROP POLICY IF EXISTS "Public can view available products" ON public.products;
CREATE POLICY "Public can view available products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (
  is_available = true
  AND EXISTS (
    SELECT 1 FROM public.categories c
    JOIN public.restaurants r ON r.id = c.restaurant_id
    WHERE c.id = products.category_id
      AND c.is_active = true
      AND r.is_active = true
  )
);

DROP POLICY IF EXISTS "Staff can view products" ON public.products;
CREATE POLICY "Staff can view products"
ON public.products
FOR SELECT
TO authenticated
USING (is_owner(restaurant_id) OR has_permission(restaurant_id, 'view_products'));

DROP POLICY IF EXISTS "Staff can create products" ON public.products;
CREATE POLICY "Staff can create products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  (is_owner(restaurant_id) OR has_permission(restaurant_id, 'create_products'))
  AND EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = products.category_id
      AND c.restaurant_id = products.restaurant_id
  )
);

DROP POLICY IF EXISTS "Staff can update products" ON public.products;
CREATE POLICY "Staff can update products"
ON public.products
FOR UPDATE
TO authenticated
USING (is_owner(restaurant_id) OR has_permission(restaurant_id, 'update_products'))
WITH CHECK (
  (is_owner(restaurant_id) OR has_permission(restaurant_id, 'update_products'))
  AND EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = products.category_id
      AND c.restaurant_id = products.restaurant_id
  )
);

DROP POLICY IF EXISTS "Staff can delete products" ON public.products;
CREATE POLICY "Staff can delete products"
ON public.products
FOR DELETE
TO authenticated
USING (is_owner(restaurant_id) OR has_permission(restaurant_id, 'delete_products'));

-- 5.4 PRODUCT VARIANTS POLICIES
DROP POLICY IF EXISTS "Public can view available variants" ON public.product_variants;
CREATE POLICY "Public can view available variants"
ON public.product_variants
FOR SELECT
TO anon, authenticated
USING (
  is_available = true
  AND EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.categories c ON c.id = p.category_id
    JOIN public.restaurants r ON r.id = c.restaurant_id
    WHERE p.id = product_variants.product_id
      AND p.is_available = true
      AND c.is_active = true
      AND r.is_active = true
  )
);

DROP POLICY IF EXISTS "Staff can view variants" ON public.product_variants;
CREATE POLICY "Staff can view variants"
ON public.product_variants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND (is_owner(p.restaurant_id) OR has_permission(p.restaurant_id, 'view_variants'))
  )
);

DROP POLICY IF EXISTS "Staff can create variants" ON public.product_variants;
CREATE POLICY "Staff can create variants"
ON public.product_variants
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND (is_owner(p.restaurant_id) OR has_permission(p.restaurant_id, 'create_variants'))
  )
);

DROP POLICY IF EXISTS "Staff can update variants" ON public.product_variants;
CREATE POLICY "Staff can update variants"
ON public.product_variants
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND (is_owner(p.restaurant_id) OR has_permission(p.restaurant_id, 'update_variants'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND (is_owner(p.restaurant_id) OR has_permission(p.restaurant_id, 'update_variants'))
  )
);

DROP POLICY IF EXISTS "Staff can delete variants" ON public.product_variants;
CREATE POLICY "Staff can delete variants"
ON public.product_variants
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND (is_owner(p.restaurant_id) OR has_permission(p.restaurant_id, 'delete_variants'))
  )
);

-- 5.5 RESTAURANT USERS POLICIES
DROP POLICY IF EXISTS "Users view self or staff in same restaurant" ON public.restaurant_users;
CREATE POLICY "Users view self or staff in same restaurant"
ON public.restaurant_users
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_owner(restaurant_id)
  OR has_permission(restaurant_id, 'manage_admins')
);

DROP POLICY IF EXISTS "Owners can update restaurant users" ON public.restaurant_users;
CREATE POLICY "Owners can update restaurant users"
ON public.restaurant_users
FOR UPDATE
TO authenticated
USING (is_owner(restaurant_id))
WITH CHECK (is_owner(restaurant_id));

-- 5.6 ADMIN PERMISSIONS POLICIES
DROP POLICY IF EXISTS "Users view self permissions or owner view" ON public.admin_permissions;
CREATE POLICY "Users view self permissions or owner view"
ON public.admin_permissions
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_owner(restaurant_id)
  OR has_permission(restaurant_id, 'manage_admins')
);

DROP POLICY IF EXISTS "Owners can manage admin permissions" ON public.admin_permissions;
CREATE POLICY "Owners can manage admin permissions"
ON public.admin_permissions
FOR ALL
TO authenticated
USING (is_owner(restaurant_id))
WITH CHECK (is_owner(restaurant_id));

-- 5.7 AUDIT LOGS POLICIES
-- Audit logs are strictly read-only from client APIs. All inserts occur via SECURITY DEFINER triggers or serverless functions.
DROP POLICY IF EXISTS "Authorized users can view audit logs" ON public.audit_logs;
CREATE POLICY "Authorized users can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  is_owner(restaurant_id) OR has_permission(restaurant_id, 'view_audit_logs')
);


-- ============================================================
-- 6. RATE LIMITING & SECURITY HARDENING
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

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.rate_limits FROM anon;
REVOKE ALL ON TABLE public.rate_limits FROM authenticated;
GRANT ALL ON TABLE public.rate_limits TO service_role;

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

  -- Atomic concurrency handling: ensure row exists without unique violation race
  INSERT INTO public.rate_limits (key, attempts, window_start, locked_until)
  VALUES (p_key, 0, v_now, NULL)
  ON CONFLICT (key) DO NOTHING;

  -- Row is guaranteed to exist: lock it for update
  SELECT * INTO v_rec
  FROM public.rate_limits
  WHERE key = p_key
  FOR UPDATE;

  -- 1. Check if locked out
  IF v_rec.locked_until IS NOT NULL THEN
    IF v_rec.locked_until > v_now THEN
      v_remaining_lockout := CEIL(EXTRACT(EPOCH FROM (v_rec.locked_until - v_now)))::integer;
      RETURN jsonb_build_object(
        'allowed', false,
        'remaining_attempts', 0,
        'retry_after', GREATEST(v_remaining_lockout, 1)
      );
    ELSE
      -- Lockout has expired: reset window and clear lockout
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
  END IF;

  -- 2. Check if current window has expired
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
        locked_until = NULL
    WHERE key = p_key;

    RETURN jsonb_build_object(
      'allowed', true,
      'remaining_attempts', GREATEST(p_max_attempts - 1, 0),
      'retry_after', 0
    );
  END IF;

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

REVOKE ALL ON FUNCTION public.is_owner(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_owner(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.setup_first_owner(text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.setup_first_owner(text, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.setup_first_owner(text, text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.setup_first_owner(text, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_audit_event() FROM PUBLIC;

REVOKE INSERT, UPDATE, DELETE ON public.restaurants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.restaurant_users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.categories FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_variants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_permissions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
