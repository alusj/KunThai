import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import { useI18n, t } from "../../../../../i18n";

export default function ProductCard({ product }) {
  useI18n();
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
        {product.stock > 0 ? t("urmall.biz.cat.inStock") : t("urmall.biz.cat.statusOutStock")}
      </span>
    </div>
  );
}
