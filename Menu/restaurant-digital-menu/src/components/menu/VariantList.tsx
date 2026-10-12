import { Price } from '../ui/Price';
import type { ProductVariant } from '../../types';

interface VariantListProps {
  variants: ProductVariant[];
  productName: string;
}

export function VariantList({ variants, productName }: VariantListProps) {
  if (variants.length === 0) return null;

  // Single unnamed variant → show price inline without a label
  if (variants.length === 1 && variants[0].name.trim() === '') {
    return (
      <div className="variant-single">
        <Price amount={variants[0].price} />
      </div>
    );
  }

  return (
    <ul className="variant-list" aria-label={`Prices for ${productName}`}>
      {variants.map((v) => (
        <li key={v.id} className="variant-row">
          <span className="variant-name">{v.name || productName}</span>
          <span className="variant-dots" aria-hidden="true" />
          <Price amount={v.price} />
        </li>
      ))}
    </ul>
  );
}
