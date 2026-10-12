import { ProductCard } from './ProductCard';
import type { CategoryWithProducts } from '../../types';

interface CategorySectionProps {
  category: CategoryWithProducts;
}

export function CategorySection({ category }: CategorySectionProps) {
  return (
    <section
      id={`cat-${category.id}`}
      className="category-section"
      aria-labelledby={`cat-title-${category.id}`}
    >
      <div className="category-header" data-aos="fade-up">
        <h2 id={`cat-title-${category.id}`} className="category-title">
          {category.name}
        </h2>
        <div className="category-divider" aria-hidden="true" />
      </div>

      {category.products.length === 0 ? (
        <p className="category-empty" data-aos="fade-up">No products currently available in this category.</p>
      ) : (
        <div className="products-grid">
          {category.products.map((product, i) => (
            <ProductCard key={product.id} product={product} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
