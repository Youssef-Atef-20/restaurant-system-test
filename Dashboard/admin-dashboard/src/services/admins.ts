import { supabase } from '../lib/supabase';
import { getRestaurantId } from '../lib/constants';
import type { AdminPermission, PermissionKey, RestaurantUser } from '../types';

export const adminsService = {
  async list() {
    return supabase
      .from('restaurant_users')
      .select('*')
      .eq('restaurant_id', getRestaurantId())
      .eq('role', 'admin')
      .order('created_at', { ascending: true });
  },

  async getPermissions(userId: string) {
    return supabase
      .from('admin_permissions')
      .select('*')
      .eq('restaurant_id', getRestaurantId())
      .eq('user_id', userId);
  },

  async setPermissions(userId: string, permissions: PermissionKey[]) {
    const restaurantId = getRestaurantId();
    // Delete existing permissions, then insert the new set
    const { error: delError } = await supabase
      .from('admin_permissions')
      .delete()
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId);

    if (delError) return { data: null, error: delError };

    if (permissions.length === 0) {
      return { data: [] as AdminPermission[], error: null };
    }

    return supabase
      .from('admin_permissions')
      .insert(
        permissions.map((permission) => ({
          restaurant_id: restaurantId,
          user_id: userId,
          permission,
        }))
      )
      .select();
  },

  async setActive(userId: string, is_active: boolean) {
    return supabase
      .from('restaurant_users')
      .update({ is_active })
      .eq('restaurant_id', getRestaurantId())
      .eq('user_id', userId)
      .select()
      .single();
  },

  async updateUsername(userId: string, username: string) {
    return supabase
      .from('restaurant_users')
      .update({ username })
      .eq('restaurant_id', getRestaurantId())
      .eq('user_id', userId)
      .select()
      .single();
  },

  /**
   * Soft-delete: mark as inactive and clear permissions.
   * We do NOT permanently delete the Auth user or the restaurant_users row
   * to preserve foreign key references in audit_logs.
   */
  async softDelete(userId: string) {
    const restaurantId = getRestaurantId();
    // Remove permissions
    await supabase
      .from('admin_permissions')
      .delete()
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId);

    // Mark as inactive with a deleted marker in username to free the name
    const { data: ru } = await supabase
      .from('restaurant_users')
      .select('username')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId)
      .single();

    const deletedUsername = ru
      ? `deleted_${Date.now()}_${ru.username}`
      : `deleted_${Date.now()}`;

    return supabase
      .from('restaurant_users')
      .update({ is_active: false, username: deletedUsername })
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId)
      .select()
      .single();
  },

  async checkUsernameAvailable(username: string, excludeUserId?: string) {
    let query = supabase
      .from('restaurant_users')
      .select('user_id')
      .eq('restaurant_id', getRestaurantId())
      .eq('username', username.trim().toLowerCase());

    if (excludeUserId) {
      query = query.neq('user_id', excludeUserId);
    }

    const { data, error } = await query;
    if (error) return false;
    return !data || data.length === 0;
  },

  async getByUserId(userId: string): Promise<{ data: RestaurantUser | null; error: Error | null }> {
    const { data, error } = await supabase
      .from('restaurant_users')
      .select('*')
      .eq('restaurant_id', getRestaurantId())
      .eq('user_id', userId)
      .single();

    return { data: data as RestaurantUser | null, error: error as Error | null };
  },
};
