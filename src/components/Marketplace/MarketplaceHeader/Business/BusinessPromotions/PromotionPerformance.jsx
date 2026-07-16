import PromotionMetricCard from "./PromotionMetricCard";

export default function PromotionPerformance({ performance }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <PromotionMetricCard
        label="Credits spent"
        value={performance.creditsSpent}
        helper="Used for visibility"
      />
      <PromotionMetricCard
        label="Pending credits"
        value={performance.pendingCredits}
        helper="Waiting on tasks"
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
    </div>
  );
}
