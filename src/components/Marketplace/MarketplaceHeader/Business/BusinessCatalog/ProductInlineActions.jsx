import { useI18n, t } from "../../../../../i18n";
import ProductActionButton from "./ProductActionButton";

export default function ProductInlineActions({ product, onAction }) {
  useI18n();
  const needsRestock = product.status === "out-of-stock" || product.status === "low-stock";

  return (
    <div className="grid gap-2 sm:flex sm:flex-wrap">
      {needsRestock ? (
        <ProductActionButton
          label={t("urmall.biz.cat.restock")}
          onClick={() => onAction?.(product, "restock")}
        />
      ) : null}
      <ProductActionButton
        label={t("urmall.biz.cat.editListing")}
        onClick={() => onAction?.(product, "edit-listing")}
      />
      <ProductActionButton
        label={t("urmall.biz.intel.insightsTab")}
        onClick={() => onAction?.(product, "insights")}
      />
      <ProductActionButton
        label={t("urmall.biz.cat.promote")}
        onClick={() => onAction?.(product, "promote")}
      />
      <ProductActionButton
        label={product.status === "paused" ? t("urmall.biz.cat.resume") : t("urmall.biz.cat.pause")}
        onClick={() => onAction?.(product, "pause")}
      />
    </div>
  );
}
