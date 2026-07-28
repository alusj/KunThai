import { useI18n, t } from "../../../../../i18n";
import CareMetricCard from "./CareMetricCard";

export default function CareMetricsGrid({ metrics }) {
  useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      <CareMetricCard
        label={t("urmall.biz.care.unread")}
        value={metrics.unreadMessages}
        helper={t("urmall.biz.care.unreadHelper")}
        tone="red"
      />
      <CareMetricCard
        label={t("urmall.biz.care.responseTime")}
        value={metrics.averageResponseTime}
        helper={t("urmall.biz.care.responseTimeHelper")}
        tone="blue"
      />
      <CareMetricCard
        label={t("urmall.biz.care.responseRate")}
        value={`${metrics.responseRate}%`}
        helper={t("urmall.biz.care.responseRateHelper")}
        tone="green"
      />
      <CareMetricCard
        label={t("urmall.biz.care.questions")}
        value={metrics.buyerQuestionsWaiting}
        helper={t("urmall.biz.care.questionsHelper")}
        tone="amber"
      />
      <CareMetricCard
        label={t("urmall.biz.care.negotiations")}
        value={metrics.negotiationRequests}
        helper={t("urmall.biz.care.negotiationsHelper")}
        tone="gray"
      />
      <CareMetricCard
        label={t("urmall.biz.care.support")}
        value={metrics.supportDisputes}
        helper={t("urmall.biz.care.supportHelper")}
        tone="red"
      />
    </div>
  );
}
