import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";

export default function ProductCard({ product }) {
  if (!product) return null; // safety guard

  return (
    <div className="rounded-xl border bg-white p-4 space-y-1">
      <p className="font-medium">{product.name}</p>
      <p className="text-sm text-gray-600">{formatCurrency(product.price)}</p>

      <span
        className={`text-xs font-medium ${
          product.stock > 0 ? "text-green-600" : "text-red-500"
        }`}
      >
        {product.stock > 0 ? "In stock" : "Out of stock"}
      </span>
    </div>
  );
}
