import CareMetricCard from "./CareMetricCard";

export default function CareMetricsGrid({ metrics }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      <CareMetricCard
        label="Unread"
        value={metrics.unreadMessages}
        helper="Buyer messages"
        tone="red"
      />
      <CareMetricCard
        label="Response time"
        value={metrics.averageResponseTime}
        helper="Average reply speed"
        tone="blue"
      />
      <CareMetricCard
        label="Response rate"
        value={`${metrics.responseRate}%`}
        helper="Messages answered"
        tone="green"
      />
      <CareMetricCard
        label="Questions"
        value={metrics.buyerQuestionsWaiting}
        helper="Waiting for answers"
        tone="amber"
      />
      <CareMetricCard
        label="Negotiations"
        value={metrics.negotiationRequests}
        helper="Open offers"
        tone="gray"
      />
      <CareMetricCard
        label="Support"
        value={metrics.supportDisputes}
        helper="Disputes or cases"
        tone="red"
      />
    </div>
  );
}
