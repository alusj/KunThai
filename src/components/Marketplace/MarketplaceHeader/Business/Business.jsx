import { useEffect, useState } from "react";

/* =========================
   MyBiz Header
========================= */
import MyBizHeader from "./BusinessHeader/MyBizHeader";


/* =========================
   Business UI blocks
========================= */
import BusinessActivity from "./BusinessActivity/BusinessActivity"
//import BusinessIdentity from "./BusinessIdentity/BusinessIdentity"
import BusinessCatalog from "./BusinessCatalog/BusinessCatalog";
import BusinessInsights from "./BusinessInsights/BusinessInsights";
import BusinessActions from "./BusinessActions/BusinessActions";
import MyBizDashboardHeader from "./MyBizDashboardHeader/MyBizDashboardHeader";
import BusinessStats from "./BusinessStats/BusinessStats";
//import BusinessActions from "./BusinessActions/BusinessActions";
//import RecentOrders from "./RecentOrders";
//import RecentMessages from "./RecentMessages";
import BusinessSkeleton from "./BusinessSkeleton";
import NoBusiness from "./NoBusiness";

export default function Business({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [hasBusiness, setHasBusiness] = useState(true);

  useEffect(() => {
    setTimeout(() => setLoading(false), 800);
  }, []);

  if (loading) return <BusinessSkeleton />;
  if (!hasBusiness) return <NoBusiness />;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* =========================
          MyBiz Header (ONLY PLACE)
      ========================= */}
      <MyBizHeader onBack={onBack} />

      {/* =========================
          Business content
      ========================= */}
      <div className="px-4 py-4 space-y-6">
                      
        <MyBizDashboardHeader />
        <BusinessCatalog />
        <BusinessStats />
        <BusinessInsights />
        <BusinessActions />
        <BusinessActivity />
                       
      </div>

    </div>
  );
}
