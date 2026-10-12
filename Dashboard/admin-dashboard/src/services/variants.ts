import { supabase } from '../lib/supabase';
import { getRestaurantId } from '../lib/constants';
import type { ProductVariant } from '../types';

export const variantsService = {
  async listByProduct(productId: string) {
    return supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
  },

  async listAll(restaurantId?: string) {
    const targetRestaurantId = restaurantId || getRestaurantId();
    return supabase
      .from('product_variants')
      .select('*, product:products!inner(id, name, restaurant_id)')
      .eq('product.restaurant_id', targetRestaurantId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
  },

  async create(data: {
    product_id: string;
    name: string;
    price: number;
    sort_order: number;
  }) {
    return supabase
      .from('product_variants')
      .insert(data)
      .select()
      .single();
  },

  async update(
    id: string,
    data: Partial<Pick<ProductVariant, 'name' | 'price' | 'sort_order'>>
  ) {
    return supabase
      .from('product_variants')
      .update(data)
      .eq('id', id)
      .select()
      .single();
  },

  async remove(id: string) {
    return supabase
      .from('product_variants')
      .delete()
      .eq('id', id);
  },
};
