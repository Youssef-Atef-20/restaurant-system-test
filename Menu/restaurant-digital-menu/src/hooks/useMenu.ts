import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { CategoryWithProducts, ProductVariant } from '../types';

interface UseMenuResult {
  restaurantName: string | null;
  categories: CategoryWithProducts[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useMenu(): UseMenuResult {
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Resolve restaurant: from URL param, env var, or first active restaurant in DB
        const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const targetId =
          searchParams?.get('restaurant') ||
          searchParams?.get('r') ||
          (import.meta.env.VITE_RESTAURANT_ID as string | undefined) ||
          '';

        const targetSlug = searchParams?.get('slug') || '';

        let restaurantQuery = supabase
          .from('restaurants')
          .select('id, name, is_active');

        const isUuid = (val: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());

        if (targetId) {
          if (isUuid(targetId)) {
            restaurantQuery = restaurantQuery.eq('id', targetId.trim());
          } else {
            restaurantQuery = restaurantQuery.eq('slug', targetId.trim());
          }
        } else if (targetSlug) {
          restaurantQuery = restaurantQuery.eq('slug', targetSlug.trim());
        } else {
          restaurantQuery = restaurantQuery.eq('is_active', true).order('created_at', { ascending: true }).limit(1);
        }

        const { data: restaurantData, error: rErr } = await restaurantQuery.maybeSingle();

        if (rErr) throw rErr;
        if (!restaurantData) throw new Error('Restaurant not found or inactive');
        if (!restaurantData.is_active) throw new Error('Restaurant is currently inactive');

        const activeRestaurantId = restaurantData.id;

        // Load categories and products for the resolved restaurant
        const [
          { data: cats, error: cErr },
          { data: prods, error: pErr },
        ] = await Promise.all([
          supabase
            .from('categories')
            .select('id, restaurant_id, name, sort_order, is_active')
            .eq('restaurant_id', activeRestaurantId)
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
          supabase
            .from('products')
            .select('id, restaurant_id, category_id, name, description, sort_order, is_available')
            .eq('restaurant_id', activeRestaurantId)
            .eq('is_available', true)
            .order('sort_order', { ascending: true }),
        ]);

        if (cErr) throw cErr;
        if (pErr) throw pErr;

        if (!cats?.length) {
          if (!cancelled) {
            setRestaurantName(restaurantData.name);
            setCategories([]);
            setLoading(false);
          }
          return;
        }

        // Load available variants for the fetched products
        const productIds = (prods ?? []).map((p) => p.id);
        let variants: ProductVariant[] = [];

        if (productIds.length > 0) {
          const { data: vars, error: vErr } = await supabase
            .from('product_variants')
            .select('id, product_id, name, price, sort_order, is_available')
            .in('product_id', productIds)
            .eq('is_available', true)
            .order('sort_order', { ascending: true });

          if (vErr) throw vErr;
          variants = vars ?? [];
        }

        // 5. Assemble the hierarchy
        const variantsByProduct = new Map<string, typeof variants>();
        for (const v of variants) {
          const arr = variantsByProduct.get(v.product_id) ?? [];
          arr.push(v);
          variantsByProduct.set(v.product_id, arr);
        }

        const productsByCategory = new Map<string, typeof prods>();
        for (const p of prods ?? []) {
          const arr = productsByCategory.get(p.category_id) ?? [];
          arr.push(p);
          productsByCategory.set(p.category_id, arr);
        }

        const enriched = cats.map((cat) => ({
          ...cat,
          products: (productsByCategory.get(cat.id) ?? []).map((prod) => ({
            ...prod,
            variants: variantsByProduct.get(prod.id) ?? [],
          })),
        }));

        if (!cancelled) {
          setRestaurantName(restaurantData.name);
          setCategories(enriched);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load digital menu. Please check your network and try again.');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tick]);

  return {
    restaurantName,
    categories,
    loading,
    error,
    retry: () => setTick((t) => t + 1),
  };
}
