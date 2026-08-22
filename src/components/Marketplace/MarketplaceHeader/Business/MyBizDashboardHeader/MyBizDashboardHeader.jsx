import { useSellerOverview } from "../../../../../Backend/hooks/useSellerOverview";
import BusinessProfileCard from "./BusinessProfileCard";
import HealthScoreCard from "./HealthScoreCard";

export default function MyBizDashboardHeader({
  onEditProfile,
  onOpenSection,
  onOpenPlans,
  overview,
  planName = "Free",
  planCode = "free",
  planAvailable = false,
}) {
  const fallbackOverview = useSellerOverview({ enabled: !overview });
  const { business, storeStatus, health, today, loading } = overview || fallbackOverview;

  if (loading || !business || !storeStatus || !health || !today) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-36 animate-pulse rounded-2xl border border-gray-200 bg-white" />
        <div className="h-56 animate-pulse rounded-2xl border border-gray-200 bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HealthScoreCard health={health} onEditProfile={onEditProfile} />
      <BusinessProfileCard
        business={business}
        status={storeStatus}
        onEditProfile={onEditProfile}
        onOpenSection={onOpenSection}
        onOpenPlans={onOpenPlans}
        planName={planName}
        planCode={planCode}
        planAvailable={planAvailable}
      />
    </div>
  );
}
