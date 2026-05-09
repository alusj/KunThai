import { useSellerOverview } from "../../../../../Backend/hooks/useSellerOverview";
import BusinessProfileCard from "./BusinessProfileCard";
import HealthScoreCard from "./HealthScoreCard";
import SellerIntelligence from "../SellerIntelligence/SellerIntelligence";
import TodaySummaryCard from "./TodaySummaryCard";

export default function MyBizDashboardHeader({ onEditProfile }) {
  const { business, storeStatus, health, today, loading } = useSellerOverview();

  if (loading || !business || !storeStatus || !health || !today) return null;

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
