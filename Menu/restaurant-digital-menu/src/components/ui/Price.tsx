interface PriceProps {
  amount: number;
}

export function Price({ amount }: PriceProps) {
  return (
    <span className="price-tag">
      <span className="price-unit">€</span>
      {amount.toFixed(2)}
    </span>
  );
}
