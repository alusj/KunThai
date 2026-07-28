import { useSellerProducts } from "../../../../Backend/hooks/useSellerProducts";
import { useI18n, t } from "../../../../i18n";

import ProductCard from "./ProductCard";

function toLegacyProductShape(product) {
  return {
    ...product,
    discount_price: product.discountPrice,
  };
}

export default function Products() {
  useI18n();
  const { actionError, loading, products } = useSellerProducts();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-48 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }

  if (actionError) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
        {actionError}
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm font-semibold text-gray-500">
        {t("urmall.biz.dash.noProducts")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">{t("urmall.biz.dash.myProducts")}</h3>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={toLegacyProductShape(product)}
          />
        ))}
      </div>
    </div>
  );
}
