-- ============================================================
-- DEMO SEED DATA FOR RESTAURANT MANAGEMENT SYSTEM & DIGITAL MENU
-- International / European-style sample restaurant data
-- ============================================================

DO $$
DECLARE
  v_restaurant_id uuid := '11111111-1111-1111-1111-111111111111';
  v_cat_burgers   uuid := '22222222-1111-1111-1111-111111111111';
  v_cat_pizza     uuid := '22222222-2222-2222-2222-222222222222';
  v_cat_drinks    uuid := '22222222-3333-3333-3333-333333333333';
  v_cat_desserts  uuid := '22222222-4444-4444-4444-444444444444';

  v_prod_classic_burger uuid := '33333333-1111-1111-1111-111111111111';
  v_prod_cheese_burger  uuid := '33333333-2222-2222-2222-222222222222';
  v_prod_margherita     uuid := '33333333-3333-3333-3333-333333333333';
  v_prod_pepperoni      uuid := '33333333-4444-4444-4444-444444444444';
  v_prod_cola           uuid := '33333333-5555-5555-5555-555555555555';
  v_prod_orange_juice   uuid := '33333333-6666-6666-6666-666666666666';
  v_prod_choc_cake      uuid := '33333333-7777-7777-7777-777777777777';
BEGIN
  -- 1. DEMO RESTAURANT
  INSERT INTO public.restaurants (id, name, slug, is_active)
  VALUES (v_restaurant_id, 'Demo Restaurant', 'demo-restaurant', true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = true;

  -- 2. DEMO CATEGORIES
  INSERT INTO public.categories (id, restaurant_id, name, sort_order, is_active)
  VALUES
    (v_cat_burgers,  v_restaurant_id, 'Burgers',  1, true),
    (v_cat_pizza,    v_restaurant_id, 'Pizza',    2, true),
    (v_cat_drinks,   v_restaurant_id, 'Drinks',   3, true),
    (v_cat_desserts, v_restaurant_id, 'Desserts', 4, true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

  -- 3. DEMO PRODUCTS
  INSERT INTO public.products (id, restaurant_id, category_id, name, description, sort_order, is_available)
  VALUES
    (v_prod_classic_burger, v_restaurant_id, v_cat_burgers,
     'Classic Beef Burger',
     '100% prime beef patty, crisp lettuce, fresh tomato, pickles, and our signature house burger sauce on a brioche bun.',
     1, true),

    (v_prod_cheese_burger, v_restaurant_id, v_cat_burgers,
     'Smoky Bacon Cheeseburger',
     'Grilled beef patty layered with aged cheddar cheese, crispy bacon, caramelized onions, and barbecue sauce.',
     2, true),

    (v_prod_margherita, v_restaurant_id, v_cat_pizza,
     'Margherita Pizza',
     'Traditional wood-fired sourdough crust, San Marzano tomato sauce, fresh mozzarella fior di latte, and fresh basil leaves.',
     1, true),

    (v_prod_pepperoni, v_restaurant_id, v_cat_pizza,
     'Pepperoni Pizza',
     'Spicy artisan beef pepperoni slices, rich mozzarella cheese, tomato passata, and fresh oregano on stone-baked crust.',
     2, true),

    (v_prod_cola, v_restaurant_id, v_cat_drinks,
     'Craft Cola',
     'Chilled refreshing sparkling cola served with fresh lemon and ice.',
     1, true),

    (v_prod_orange_juice, v_restaurant_id, v_cat_drinks,
     'Fresh Orange Juice',
     'Cold-pressed 100% natural Valencia oranges without added sugars or preservatives.',
     2, true),

    (v_prod_choc_cake, v_restaurant_id, v_cat_desserts,
     'Chocolate Fudge Cake',
     'Warm Belgian chocolate molten cake served with silky chocolate ganache and vanilla bean cream.',
     1, true)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_available = true;

  -- 4. DEMO PRODUCT VARIANTS & PRICES (European format)
  -- Classic Burger Variants
  INSERT INTO public.product_variants (product_id, name, price, sort_order, is_available)
  VALUES
    (v_prod_classic_burger, 'Single Patty', 9.90, 1, true),
    (v_prod_classic_burger, 'Combo Meal (with fries & soft drink)', 13.90, 2, true);

  -- Cheeseburger Variants
  INSERT INTO public.product_variants (product_id, name, price, sort_order, is_available)
  VALUES
    (v_prod_cheese_burger, 'Single Patty', 11.50, 1, true),
    (v_prod_cheese_burger, 'Combo Meal (with fries & soft drink)', 15.50, 2, true),
    (v_prod_cheese_burger, 'Double Patty Monster', 17.90, 3, true);

  -- Margherita Pizza Variants
  INSERT INTO public.product_variants (product_id, name, price, sort_order, is_available)
  VALUES
    (v_prod_margherita, 'Medium (28cm)', 10.50, 1, true),
    (v_prod_margherita, 'Large (35cm)', 14.50, 2, true);

  -- Pepperoni Pizza Variants
  INSERT INTO public.product_variants (product_id, name, price, sort_order, is_available)
  VALUES
    (v_prod_pepperoni, 'Medium (28cm)', 12.90, 1, true),
    (v_prod_pepperoni, 'Large (35cm)', 16.90, 2, true);

  -- Drinks Variants
  INSERT INTO public.product_variants (product_id, name, price, sort_order, is_available)
  VALUES
    (v_prod_cola, 'Can (330ml)', 2.50, 1, true),
    (v_prod_cola, 'Bottle (500ml)', 3.50, 2, true);

  -- Orange Juice Variants
  INSERT INTO public.product_variants (product_id, name, price, sort_order, is_available)
  VALUES
    (v_prod_orange_juice, 'Regular (300ml)', 3.90, 1, true),
    (v_prod_orange_juice, 'Large (500ml)', 5.20, 2, true);

  -- Chocolate Cake Variants
  INSERT INTO public.product_variants (product_id, name, price, sort_order, is_available)
  VALUES
    (v_prod_choc_cake, 'Single Slice', 5.90, 1, true),
    (v_prod_choc_cake, 'Slice with Gelato Scoop', 7.50, 2, true);

END $$;
