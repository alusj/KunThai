import { useI18n, t } from "../../../../../i18n";
import ProductManagementRow from "./ProductManagementRow";

export default function ProductManagementList({ mode = "store", products, onAction, onViewProduct, insightsLocked = false }) {
  useI18n();
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="px-4 py-4">
        <h3 className="text-lg font-black text-gray-950">{t("urmall.biz.cat.productManagement")}</h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          {t("urmall.biz.cat.productManagementDesc")}
        </p>
      </div>

      <div>
        {products.map((product) => (
          <ProductManagementRow
            key={product.id}
            mode={mode}
            product={product}
            insightsLocked={insightsLocked}
            onAction={onAction}
            onViewProduct={onViewProduct}
          />
        ))}
      </div>
    </section>
  );
}
