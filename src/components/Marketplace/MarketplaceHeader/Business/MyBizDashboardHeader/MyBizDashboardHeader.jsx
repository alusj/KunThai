import { useSellerOverview } from "../../../../../Backend/hooks/useSellerOverview";
import BusinessProfileCard from "./BusinessProfileCard";
import HealthScoreCard from "./HealthScoreCard";
import SellerIntelligence from "../SellerIntelligence/SellerIntelligence";
import TodaySummaryCard from "./TodaySummaryCard";

export default function MyBizDashboardHeader({ onEditProfile }) {
  const { business, storeStatus, health, today, loading } = useSellerOverview();

  if (loading || !business || !storeStatus || !health || !today) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl bg-gray-200" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-5 w-48 rounded bg-gray-200" />
                <div className="h-4 w-64 max-w-full rounded bg-gray-100" />
                <div className="h-4 w-32 rounded bg-gray-100" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="h-5 w-32 rounded bg-gray-200" />
            <div className="mt-5 h-16 w-16 rounded-full bg-gray-100" />
            <div className="mt-4 h-2 rounded-full bg-gray-100" />
          </div>
        </div>

        <div className="flex gap-3 overflow-x-auto rounded-xl border border-gray-200 bg-white p-3 shadow-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-16 min-w-[170px] flex-1 rounded-lg bg-gray-100"
            />
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-24 rounded-xl border border-gray-200 bg-white shadow-sm"
            />
          ))}
        </div>
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
