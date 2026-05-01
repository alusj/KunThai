import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import PromotionMetricCard from "./PromotionMetricCard";

export default function PromotionPerformance({ performance }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <PromotionMetricCard
        label="Budget spent"
        value={formatCurrency(performance.budgetSpent)}
        helper="Across active promos"
      />
      <PromotionMetricCard
        label="Promo views"
        value={performance.viewsFromPromotions}
        helper="Views from boosted listings"
      />
      <PromotionMetricCard
        label="Promo orders"
        value={performance.ordersFromPromotions}
        helper="Orders from campaigns"
      />
      <PromotionMetricCard
        label="Promo revenue"
        value={formatCurrency(performance.discountRevenue)}
        helper="Revenue influenced by promos"
      />
    </div>
  );
}
