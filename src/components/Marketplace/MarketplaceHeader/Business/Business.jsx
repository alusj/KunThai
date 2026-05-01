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
import AddProductForm from "./ProductForm/AddProductForm";
import SellerWorkspaceTabs from "./SellerWorkspaceTabs";
import ProductSuccessToast from "./ProductSuccessToast";
//import RecentOrders from "./RecentOrders";
//import RecentMessages from "./RecentMessages";
import BusinessSkeleton from "./BusinessSkeleton";
import BusinessRegistration from "./BusinessRegistration/BusinessRegistration";
import { useSellerBusinessStatus } from "../../../../Backend/hooks/useSellerBusinessStatus";
import { useState } from "react";

export default function Business({ onBack }) {
  const { loading, hasBusiness, setHasBusiness } = useSellerBusinessStatus();
  const [activeScreen, setActiveScreen] = useState("dashboard");
  const [activeTab, setActiveTab] = useState("overview");
  const [toastMessage, setToastMessage] = useState("");

  if (loading) return <BusinessSkeleton />;

  return (
    <div className="min-h-screen bg-gray-50">
      <ProductSuccessToast message={toastMessage} onClose={() => setToastMessage("")} />

      {/* =========================
          MyBiz Header (ONLY PLACE)
      ========================= */}
      {hasBusiness && activeScreen !== "addProduct" ? (
        <MyBizHeader onBack={onBack} onAddProduct={() => setActiveScreen("addProduct")} />
      ) : null}

      {!hasBusiness ? (
        <BusinessRegistration onComplete={() => setHasBusiness(true)} />
      ) : activeScreen === "addProduct" ? (
        <AddProductForm
          onCancel={() => setActiveScreen("dashboard")}
          onComplete={() => {
            setActiveScreen("dashboard");
            setActiveTab("store");
            setToastMessage("Product added successfully");
            setTimeout(() => setToastMessage(""), 4500);
          }}
        />
      ) : (
        <>

      {/* =========================
          Business content
      ========================= */}
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_432px]">
          <main className="space-y-6">
            <MyBizDashboardHeader />
            <SellerWorkspaceTabs activeTab={activeTab} onTabChange={setActiveTab} />
            {activeTab === "overview" ? (
              <>
                <BusinessAttention
                  onAction={(item) => {
                    if (item.id === "add-first-product") setActiveScreen("addProduct");
                    if (item.type === "payout") setActiveTab("overview");
                    if (item.type === "profile") setActiveTab("overview");
                  }}
                />
                <BusinessPromotions />
              </>
            ) : null}
            {activeTab === "sales" ? <BusinessStats /> : null}
            {activeTab === "store" ? <BusinessCatalog mode="store" /> : null}
            {activeTab === "catalog" ? <BusinessCatalog mode="catalog" /> : null}
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
