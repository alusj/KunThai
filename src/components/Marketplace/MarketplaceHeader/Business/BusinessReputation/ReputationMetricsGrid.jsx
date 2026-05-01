import ReputationMetricCard from "./ReputationMetricCard";

export default function ReputationMetricsGrid({ metrics }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      <ReputationMetricCard
        label="Seller rating"
        value={metrics.rating.toFixed(1)}
        helper={`${metrics.reviewCount} reviews`}
        tone="green"
      />
      <ReputationMetricCard
        label="Complaint rate"
        value={`${metrics.complaintRate}%`}
        helper="Lower is better"
        tone={metrics.complaintRate > 3 ? "red" : "green"}
      />
      <ReputationMetricCard
        label="Cancellation rate"
        value={`${metrics.cancellationRate}%`}
        helper="Orders cancelled by store"
        tone={metrics.cancellationRate > 5 ? "red" : "amber"}
      />
      <ReputationMetricCard
        label="On-time delivery"
        value={`${metrics.onTimeDeliveryRate}%`}
        helper="Orders delivered on schedule"
        tone="blue"
      />
      <ReputationMetricCard
        label="Profile complete"
        value={`${metrics.profileCompleteness}%`}
        helper="Store trust setup"
        tone="amber"
      />
    </div>
  );
}
