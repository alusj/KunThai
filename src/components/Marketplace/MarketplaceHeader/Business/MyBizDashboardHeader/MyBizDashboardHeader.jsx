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

  // These are informational cards, not a loading surface. Keep them out of the
  // layout until their real values exist; listing sections below own the only
  // seller-dashboard skeletons.
  if (loading || !business || !storeStatus || !health || !today) return null;

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
