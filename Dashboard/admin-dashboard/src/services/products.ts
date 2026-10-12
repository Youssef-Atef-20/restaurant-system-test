import { supabase } from '../lib/supabase';
import { getRestaurantId } from '../lib/constants';
import type { Product } from '../types';

export const productsService = {
  async list() {
    return supabase
      .from('products')
      .select('*, category:categories(id, name)')
      .eq('restaurant_id', getRestaurantId())
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
  },

  async create(data: {
    category_id: string;
    name: string;
    description: string | null;
    sort_order: number;
    is_available: boolean;
  }) {
    return supabase
      .from('products')
      .insert({ ...data, restaurant_id: getRestaurantId() })
      .select('*, category:categories(id, name)')
      .single();
  },

  async update(
    id: string,
    data: Partial<Pick<Product, 'category_id' | 'name' | 'description' | 'sort_order' | 'is_available'>>
  ) {
    return supabase
      .from('products')
      .update(data)
      .eq('id', id)
      .eq('restaurant_id', getRestaurantId())
      .select('*, category:categories(id, name)')
      .single();
  },

  async remove(id: string) {
    return supabase
      .from('products')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', getRestaurantId());
  },
};
