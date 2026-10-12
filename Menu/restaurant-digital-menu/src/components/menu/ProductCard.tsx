import { VariantList } from './VariantList';
import type { ProductWithVariants } from '../../types';

interface ProductCardProps {
  product: ProductWithVariants;
  index: number;
}

export function ProductCard({ product, index }: ProductCardProps) {
  return (
    <article
      className="product-card"
      data-aos="fade-up"
      data-aos-delay={Math.min(index * 60, 300)}
    >
      <div className="product-card-inner">
        <h3 className="product-name">{product.name}</h3>
        {product.description && (
          <p className="product-description">{product.description}</p>
        )}
        <div className="product-footer">
          <VariantList variants={product.variants} productName={product.name} />
        </div>
      </div>
    </article>
  );
}
