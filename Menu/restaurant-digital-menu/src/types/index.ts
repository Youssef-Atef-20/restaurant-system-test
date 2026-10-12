export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface Product {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_available: boolean;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  price: number;
  sort_order: number;
  is_available: boolean;
}

// Enriched types for rendering
export interface ProductWithVariants extends Product {
  variants: ProductVariant[];
}

export interface CategoryWithProducts extends Category {
  products: ProductWithVariants[];
}
