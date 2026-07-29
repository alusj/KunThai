import { useI18n, t } from "../../../../../i18n";
import ReputationMetricCard from "./ReputationMetricCard";

export default function ReputationMetricsGrid({ metrics }) {
  useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      <ReputationMetricCard
        label={t("urmall.biz.rep.sellerRating")}
        value={metrics.rating.toFixed(1)}
        helper={t("urmall.biz.dash.reviews", { count: metrics.reviewCount })}
        tone="green"
      />
      <ReputationMetricCard
        label={t("urmall.biz.intel.complaintRate")}
        value={`${metrics.complaintRate}%`}
        helper={t("urmall.biz.rep.lowerBetter")}
        tone={metrics.complaintRate > 3 ? "red" : "green"}
      />
      <ReputationMetricCard
        label={t("urmall.biz.intel.cancellationRate")}
        value={`${metrics.cancellationRate}%`}
        helper={t("urmall.biz.rep.cancelledByStore")}
        tone={metrics.cancellationRate > 5 ? "red" : "amber"}
      />
      <ReputationMetricCard
        label={t("urmall.biz.intel.onTimeDelivery")}
        value={`${metrics.onTimeDeliveryRate}%`}
        helper={t("urmall.biz.rep.deliveredOnSchedule")}
        tone="blue"
      />
      <ReputationMetricCard
        label={t("urmall.biz.rep.profileComplete")}
        value={`${metrics.profileCompleteness}%`}
        helper={t("urmall.biz.rep.trustSetup")}
        tone="amber"
      />
    </div>
  );
}
