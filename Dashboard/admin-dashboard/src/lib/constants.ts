import type { PermissionKey } from '../types';

/**
 * English labels for permission keys.
 */
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  view_categories: 'View Categories',
  create_categories: 'Create Categories',
  update_categories: 'Edit Categories',
  delete_categories: 'Delete Categories',

  view_products: 'View Products',
  create_products: 'Create Products',
  update_products: 'Edit Products',
  delete_products: 'Delete Products',

  view_variants: 'View Variants & Prices',
  create_variants: 'Create Variants & Prices',
  update_variants: 'Edit Variants & Prices',
  delete_variants: 'Delete Variants & Prices',

  manage_admins: 'Manage Administrators',
  view_audit_logs: 'View Audit Logs',
};

/**
 * Permission groups for rendering checkboxes in the UI.
 */
export const PERMISSION_GROUPS: {
  label: string;
  keys: PermissionKey[];
}[] = [
  {
    label: 'Categories',
    keys: ['view_categories', 'create_categories', 'update_categories', 'delete_categories'],
  },
  {
    label: 'Products',
    keys: ['view_products', 'create_products', 'update_products', 'delete_products'],
  },
  {
    label: 'Variants & Prices',
    keys: ['view_variants', 'create_variants', 'update_variants', 'delete_variants'],
  },
  {
    label: 'Administration & Security',
    keys: ['manage_admins', 'view_audit_logs'],
  },
];

/**
 * Dynamic restaurant ID:
 * 1. Read from localStorage (saved upon user login)
 * 2. Or from optional VITE_RESTAURANT_ID environment variable
 */
export let RESTAURANT_ID =
  (typeof window !== 'undefined' ? localStorage.getItem('active_restaurant_id') : null) ||
  (import.meta.env.VITE_RESTAURANT_ID as string | undefined) ||
  '';

export function setRestaurantId(id: string) {
  RESTAURANT_ID = id;
  if (typeof window !== 'undefined') {
    if (id) {
      localStorage.setItem('active_restaurant_id', id);
    } else {
      localStorage.removeItem('active_restaurant_id');
    }
  }
}

export function getRestaurantId(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('active_restaurant_id');
    if (stored) return stored;
  }
  return RESTAURANT_ID || (import.meta.env.VITE_RESTAURANT_ID as string | undefined) || '';
}
