/* =========================
   MyBiz Header
========================= */
import MyBizHeader from "./BusinessHeader/MyBizHeader";


/* =========================
   Business UI blocks
========================= */
import BusinessActivity from "./BusinessActivity/BusinessActivity"
//import BusinessIdentity from "./BusinessIdentity/BusinessIdentity"
import BusinessAttention from "./BusinessAttention/BusinessAttention";
import BusinessCatalog from "./BusinessCatalog/BusinessCatalog";
import BusinessInsights from "./BusinessInsights/BusinessInsights";
import BusinessPayouts from "./BusinessPayouts/BusinessPayouts";
import BusinessPromotions from "./BusinessPromotions/BusinessPromotions";
import BusinessReputation from "./BusinessReputation/BusinessReputation";
import CustomerCare from "./CustomerCare/CustomerCare";
import MyBizDashboardHeader from "./MyBizDashboardHeader/MyBizDashboardHeader";
import BusinessStats from "./BusinessStats/BusinessStats";
//import RecentOrders from "./RecentOrders";
//import RecentMessages from "./RecentMessages";
import BusinessSkeleton from "./BusinessSkeleton";
import BusinessRegistration from "./BusinessRegistration/BusinessRegistration";
import { useSellerBusinessStatus } from "../../../../Backend/hooks/useSellerBusinessStatus";

export default function Business({ onBack }) {
  const { loading, hasBusiness, setHasBusiness } = useSellerBusinessStatus();

  if (loading) return <BusinessSkeleton />;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* =========================
          MyBiz Header (ONLY PLACE)
      ========================= */}
      <MyBizHeader onBack={onBack} />

      {!hasBusiness ? (
        <BusinessRegistration onComplete={() => setHasBusiness(true)} />
      ) : (
        <>

      {/* =========================
          Business content
      ========================= */}
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_432px]">
          <main className="space-y-6">
            <MyBizDashboardHeader />
            <BusinessAttention />
            <BusinessStats />
            <BusinessCatalog />
            <BusinessPromotions />
          </main>

          <aside className="space-y-6">
            <BusinessInsights />
            <BusinessPayouts />
            <CustomerCare />
            <BusinessReputation />
            <BusinessActivity />
          </aside>
        </div>
      </div>
        </>
      )}

    </div>
  );
}
