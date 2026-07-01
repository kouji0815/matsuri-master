"use client";

import ProductButton from "@/components/ProductButton";
import type { Product } from "@/types";

type Props = {
  products: Product[];
  onSell: (productId: string) => void;
  onLongPress: (product: Product) => void;
};

export default function OrderPanel({ products, onSell, onLongPress }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <ProductButton key={product.id} product={product} onSell={onSell} onLongPress={onLongPress} />
      ))}
    </div>
  );
}
