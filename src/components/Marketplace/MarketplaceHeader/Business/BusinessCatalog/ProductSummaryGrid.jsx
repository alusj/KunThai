import { useI18n, t } from "../../../../../i18n";
import ProductSummaryCard from "./ProductSummaryCard";

export default function ProductSummaryGrid({ summary }) {
  useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <ProductSummaryCard label={t("urmall.biz.cat.sumActive")} value={summary.active} tone="green" />
      <ProductSummaryCard label={t("urmall.biz.cat.sumDrafts")} value={summary.draft} />
      <ProductSummaryCard label={t("urmall.biz.cat.sumOutStock")} value={summary.outOfStock} tone="red" />
      <ProductSummaryCard label={t("urmall.biz.cat.sumLowStock")} value={summary.lowStock} tone="amber" />
      <ProductSummaryCard label={t("urmall.biz.cat.sumPendingReview")} value={summary.pendingReview} tone="blue" />
      <ProductSummaryCard label={t("urmall.biz.cat.sumNoViews")} value={summary.noViewsOrSales} tone="amber" />
    </div>
  );
}
