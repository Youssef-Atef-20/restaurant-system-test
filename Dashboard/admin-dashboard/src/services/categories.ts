import { supabase } from '../lib/supabase';
import { getRestaurantId } from '../lib/constants';
import type { Category } from '../types';

export const categoriesService = {
  async list() {
    return supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', getRestaurantId())
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
  },

  async create(data: { name: string; sort_order: number; is_active: boolean }) {
    return supabase
      .from('categories')
      .insert({ ...data, restaurant_id: getRestaurantId() })
      .select()
      .single();
  },

  async update(id: string, data: Partial<Pick<Category, 'name' | 'sort_order' | 'is_active'>>) {
    return supabase
      .from('categories')
      .update(data)
      .eq('id', id)
      .eq('restaurant_id', getRestaurantId())
      .select()
      .single();
  },

  async remove(id: string) {
    return supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', getRestaurantId());
  },
};
