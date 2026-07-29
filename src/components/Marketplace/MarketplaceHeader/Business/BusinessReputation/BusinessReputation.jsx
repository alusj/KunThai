import { useSellerReputation } from "../../../../../Backend/hooks/useSellerReputation";
import { useI18n, t } from "../../../../../i18n";
import ProfileCompletenessBar from "./ProfileCompletenessBar";
import ReputationMetricsGrid from "./ReputationMetricsGrid";
import ReviewList from "./ReviewList";
import VerifiedBadgeList from "./VerifiedBadgeList";

export default function BusinessReputation() {
  useI18n();
  const {
    metrics,
    badges,
    reviewsNeedingResponse,
    recentReviews,
    loading,
  } = useSellerReputation();

  if (loading || !metrics) return null;

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-black uppercase text-amber-700">{t("urmall.biz.intel.trustTab")}</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">
          {t("urmall.biz.rep.title")}
        </h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          {t("urmall.biz.rep.subtitle")}
        </p>
      </div>

      <ReputationMetricsGrid metrics={metrics} />
      <VerifiedBadgeList badges={badges} />
      <ProfileCompletenessBar value={metrics.profileCompleteness} />
      <ReviewList
        title={t("urmall.biz.rep.responsesNeeded")}
        reviews={reviewsNeedingResponse}
        showRespond
      />
      <ReviewList title={t("urmall.biz.rep.recentReviews")} reviews={recentReviews} />
    </section>
  );
}
