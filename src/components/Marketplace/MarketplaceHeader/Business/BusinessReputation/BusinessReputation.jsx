import { useSellerReputation } from "../../../../../Backend/hooks/useSellerReputation";
import { useI18n, t } from "../../../../../i18n";
import AiAssistButton from "../../../../ai/AiAssistButton";
import { fetchSellerReviewsForAssistant } from "../../../../../Backend/services/marketplace/sellerReputationService";
import { reviewFactsForAi } from "../../../../../Backend/services/ai/urmallAiModels";
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
      <div className={`relative ${metrics.reviewCount ? "pr-36" : ""}`}>
        {metrics.reviewCount ? (
          <div className="absolute right-0 top-0">
            <AiAssistButton
              label={t("ai.seller.reviewInsights")}
              getRequest={() => ({
                surface: "urmall",
                screen: "seller reputation",
                title: t("ai.seller.reviewInsights"),
                hidePrompts: true,
                hideAsk: true,
                task: "urmall.seller_review_insights",
                actions: ["urmall.seller_review_insights"],
                buildInput: async () => {
                  const data = await fetchSellerReviewsForAssistant();
                  return { reviews: reviewFactsForAi(data, 30) };
                },
              })}
            />
          </div>
        ) : null}
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
