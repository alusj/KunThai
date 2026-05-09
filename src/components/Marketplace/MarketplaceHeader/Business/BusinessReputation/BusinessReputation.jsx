import { useSellerReputation } from "../../../../../Backend/hooks/useSellerReputation";
import ProfileCompletenessBar from "./ProfileCompletenessBar";
import ReputationMetricsGrid from "./ReputationMetricsGrid";
import ReviewList from "./ReviewList";
import VerifiedBadgeList from "./VerifiedBadgeList";

export default function BusinessReputation() {
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
        <p className="text-sm font-black uppercase text-amber-700">Trust & Reputation</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">
          Buyer confidence
        </h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          Track reviews, reliability, delivery quality, and store trust signals.
        </p>
      </div>

      <ReputationMetricsGrid metrics={metrics} />
      <VerifiedBadgeList badges={badges} />
      <ProfileCompletenessBar value={metrics.profileCompleteness} />
      <ReviewList
        title="Review responses needed"
        reviews={reviewsNeedingResponse}
        showRespond
      />
      <ReviewList title="Recent reviews" reviews={recentReviews} />
    </section>
  );
}
