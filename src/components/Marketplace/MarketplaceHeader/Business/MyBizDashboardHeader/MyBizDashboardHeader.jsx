import { useSellerOverview } from "../../../../../Backend/hooks/useSellerOverview";
import BusinessProfileCard from "./BusinessProfileCard";
import HealthScoreCard from "./HealthScoreCard";
import SellerIntelligence from "../SellerIntelligence/SellerIntelligence";
import TodaySummaryCard from "./TodaySummaryCard";

export default function MyBizDashboardHeader({ onEditProfile, overview }) {
  const fallbackOverview = useSellerOverview({ enabled: !overview });
  const { business, storeStatus, health, today, loading } = overview || fallbackOverview;

  if (loading || !business || !storeStatus || !health || !today) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-36 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-36 animate-pulse rounded-xl border border-gray-200 bg-white" />
        </div>
        <div className="h-28 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <BusinessProfileCard
          business={business}
          status={storeStatus}
          onEditProfile={onEditProfile}
        />
        <HealthScoreCard health={health} />
      </div>

      <TodaySummaryCard today={today} />
      <SellerIntelligence />
    </div>
  );
}
