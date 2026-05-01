import InsightMetricCard from "./InsightMetricCard";

export default function InsightMetricsGrid({ metrics }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      <InsightMetricCard {...metrics.viewsTrend} />
      <InsightMetricCard {...metrics.productClicks} />
      <InsightMetricCard {...metrics.conversionRate} />
      <InsightMetricCard {...metrics.returningCustomers} />
    </div>
  );
}
