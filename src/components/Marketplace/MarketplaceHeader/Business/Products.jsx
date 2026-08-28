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
      <div className="space-y-4" aria-label="Loading seller products" aria-busy="true">
        <div className="kt-startup-shimmer h-5 w-36 rounded-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="overflow-hidden rounded-[20px] border border-slate-200 bg-white">
              <div className="kt-startup-shimmer aspect-[4/3] w-full" />
              <div className="space-y-2 p-3">
                <div className="kt-startup-shimmer h-4 w-4/5 rounded-full" />
                <div className="kt-startup-shimmer h-3 w-3/5 rounded-full" />
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="kt-startup-shimmer h-5 w-1/2 rounded-full" />
                  <div className="kt-startup-shimmer h-8 w-8 rounded-xl" />
                </div>
              </div>
            </div>
          ))}
        </div>
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
