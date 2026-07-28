import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import { useI18n, t } from "../../../../../i18n";
import PromotionMetricCard from "./PromotionMetricCard";

export default function PromotionPerformance({ performance }) {
  useI18n();
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <PromotionMetricCard
        label={t("urmall.biz.promo.creditsUsed")}
        value={performance.budgetSpent}
        helper={t("urmall.biz.promo.creditsUsedHelper")}
      />
      <PromotionMetricCard
        label={t("urmall.biz.promo.promoViews")}
        value={performance.viewsFromPromotions}
        helper={t("urmall.biz.promo.promoViewsHelper")}
      />
      <PromotionMetricCard
        label={t("urmall.biz.promo.promoOrders")}
        value={performance.ordersFromPromotions}
        helper={t("urmall.biz.promo.promoOrdersHelper")}
      />
      <PromotionMetricCard
        label={t("urmall.biz.promo.promoRevenue")}
        value={formatCurrency(performance.discountRevenue)}
        helper={t("urmall.biz.promo.promoRevenueHelper")}
      />
    </div>
  );
}
