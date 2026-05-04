/* =========================
   MyBiz Header
========================= */
import MyBizHeader from "./BusinessHeader/MyBizHeader";
import MyBizMenu from "./BusinessHeader/MyBizMenu/MyBizMenu";


/* =========================
   Business UI blocks
========================= */
//import BusinessIdentity from "./BusinessIdentity/BusinessIdentity"
import BusinessAttention from "./BusinessAttention/BusinessAttention";
import BusinessCatalog from "./BusinessCatalog/BusinessCatalog";
import BusinessPromotions from "./BusinessPromotions/BusinessPromotions";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuInitialScreen, setMenuInitialScreen] = useState(null);
  const [profileInitialView, setProfileInitialView] = useState("menu");
  const [editingProduct, setEditingProduct] = useState(null);

  function openProfileEditor() {
    setMenuInitialScreen("profile");
    setProfileInitialView("edit");
    setMenuOpen(true);
  }

  function openSellerMenu() {
    setMenuInitialScreen(null);
    setProfileInitialView("menu");
    setMenuOpen(true);
  }

  if (loading) return <BusinessSkeleton />;

  return (
    <div className="min-h-screen bg-gray-50">
      <ProductSuccessToast message={toastMessage} onClose={() => setToastMessage("")} />

      {/* =========================
          MyBiz Header (ONLY PLACE)
      ========================= */}
      {hasBusiness && activeScreen !== "addProduct" ? (
        <MyBizHeader
          onBack={onBack}
          onAddProduct={() => {
            setEditingProduct(null);
            setActiveScreen("addProduct");
          }}
          onMessages={() => {
            setActiveScreen("dashboard");
            setActiveTab("messages");
          }}
          onMenu={openSellerMenu}
        />
      ) : null}

      {hasBusiness ? (
        <MyBizMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          initialScreenKey={menuInitialScreen}
          profileInitialView={profileInitialView}
        />
      ) : null}

      {!hasBusiness ? (
        <BusinessRegistration onComplete={() => setHasBusiness(true)} />
      ) : activeScreen === "addProduct" ? (
        <AddProductForm
          mode={editingProduct ? "edit" : "create"}
          product={editingProduct}
          onCancel={() => setActiveScreen("dashboard")}
          onComplete={() => {
            const wasEditing = Boolean(editingProduct);
            setActiveScreen("dashboard");
            setActiveTab("store");
            setEditingProduct(null);
            setToastMessage(wasEditing ? "Product listing updated successfully" : "Product added successfully");
            setTimeout(() => setToastMessage(""), 4500);
          }}
        />
      ) : (
        <>

      {/* =========================
          Business content
      ========================= */}
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <div>
          <main className="space-y-6">
            <MyBizDashboardHeader onEditProfile={openProfileEditor} />
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
            {activeTab === "messages" ? <CustomerCare /> : null}
            {activeTab === "store" ? (
              <BusinessCatalog
                mode="store"
                onEditProduct={(product) => {
                  setEditingProduct(product);
                  setActiveScreen("addProduct");
                }}
              />
            ) : null}
            {activeTab === "catalog" ? (
              <BusinessCatalog
                mode="catalog"
                onEditProduct={(product) => {
                  setEditingProduct(product);
                  setActiveScreen("addProduct");
                }}
              />
            ) : null}
          </main>
        </div>
      </div>
        </>
      )}

    </div>
  );
}
