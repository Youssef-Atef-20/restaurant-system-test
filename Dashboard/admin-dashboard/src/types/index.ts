// ============================================================
// Domain Types — mirror existing Supabase schema exactly
// ============================================================

export type UserRole = 'owner' | 'admin';

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface RestaurantUser {
  restaurant_id: string;
  user_id: string;
  username: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_available: boolean;
  created_at: string;
  // joined
  category?: Category;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  price: number;
  sort_order: number;
  created_at: string;
  // joined
  product?: Product;
}

// ============================================================
// Permission Keys — match database exactly (English)
// ============================================================

export const ALL_PERMISSION_KEYS = [
  'view_categories',
  'create_categories',
  'update_categories',
  'delete_categories',
  'view_products',
  'create_products',
  'update_products',
  'delete_products',
  'view_variants',
  'create_variants',
  'update_variants',
  'delete_variants',
  'manage_admins',
  'view_audit_logs',
] as const;

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];



export interface AdminPermission {
  restaurant_id: string;
  user_id: string;
  permission: PermissionKey;
}

export interface AuditLog {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  // joined
  performer?: RestaurantUser;
}

// ============================================================
// Auth / Session state
// ============================================================

export interface AuthUser {
  restaurantUser: RestaurantUser;
  role: UserRole;
  permissions: Set<PermissionKey>; // empty for owner (owner has all)
}
