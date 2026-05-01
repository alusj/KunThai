import { useSellerOverview } from "../../../../../Backend/hooks/useSellerOverview";
import BusinessProfileCard from "./BusinessProfileCard";
import HealthScoreCard from "./HealthScoreCard";
import StoreStatusPills from "./StoreStatusPills";
import TodaySummaryCard from "./TodaySummaryCard";

export default function MyBizDashboardHeader() {
  const { business, storeStatus, health, today, loading } = useSellerOverview();

  if (loading || !business || !storeStatus || !health || !today) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-36 rounded-xl bg-white shadow-sm" />
        <div className="h-36 rounded-xl bg-white shadow-sm" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <BusinessProfileCard business={business} />
        <HealthScoreCard health={health} />
      </div>

      <StoreStatusPills status={storeStatus} />
      <TodaySummaryCard today={today} />
    </div>
  );
}
