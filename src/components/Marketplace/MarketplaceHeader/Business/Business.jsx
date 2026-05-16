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
import BusinessActivity from "./BusinessActivity/BusinessActivity";
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
import BusinessRegistration from "./BusinessRegistration/BusinessRegistration";
import { useSellerBusinessStatus } from "../../../../Backend/hooks/useSellerBusinessStatus";
import { useState } from "react";
import AppBackTab from "../../../shared/AppBackTab";
import BusinessSkeleton from "./BusinessSkeleton";

function SellerFullScreen({ eyebrow, title, subtitle, onBack, children }) {
  return (
    <section className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label="Back to seller dashboard"
            historyKey={`marketplace-seller-${title}`}
            className="mt-0.5 flex-none"
            useHistoryLayer={false}
          />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-emerald-700">{eyebrow}</p>
            <h1 className="truncate text-lg font-black text-gray-950">{title}</h1>
            {subtitle ? <p className="truncate text-xs text-gray-500">{subtitle}</p> : null}
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-5 sm:px-6 lg:px-8">
        {children}
      </main>
    </section>
  );
}

export default function Business({ onBack }) {
  const { loading, hasBusiness, setHasBusiness } = useSellerBusinessStatus();
  const [activeScreen, setActiveScreen] = useState("dashboard");
  const [screenHistory, setScreenHistory] = useState([]);
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

  function openSellerScreen(screen) {
    if (activeScreen === screen) return;

    setScreenHistory((history) => [...history, activeScreen]);
    setActiveScreen(screen);
  }

  function replaceSellerScreen(screen) {
    setScreenHistory([]);
    setActiveScreen(screen);
  }

  function goBackSellerScreen() {
    setScreenHistory((history) => {
      const previousScreen = history.at(-1) || "dashboard";
      setActiveScreen(previousScreen);
      return history.slice(0, -1);
    });
  }

  if (loading) return <BusinessSkeleton />;

  return (
    <div className="min-h-screen bg-gray-50">
      <ProductSuccessToast message={toastMessage} onClose={() => setToastMessage("")} />

      {/* =========================
          MyBiz Header (ONLY PLACE)
      ========================= */}
      {hasBusiness && activeScreen === "dashboard" ? (
        <MyBizHeader
          onBack={onBack}
          onAddProduct={() => {
            setEditingProduct(null);
            openSellerScreen("addProduct");
          }}
          onOrders={() => {
            openSellerScreen("orders");
          }}
          onMessages={() => {
            openSellerScreen("messages");
          }}
          onAlerts={() => {
            openSellerScreen("notifications");
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
          onCancel={goBackSellerScreen}
          onComplete={() => {
            const wasEditing = Boolean(editingProduct);
            replaceSellerScreen("dashboard");
            setActiveTab("store");
            setEditingProduct(null);
            setToastMessage(wasEditing ? "Product listing updated successfully" : "Product added successfully");
            setTimeout(() => setToastMessage(""), 4500);
          }}
        />
      ) : activeScreen === "messages" ? (
        <SellerFullScreen
          eyebrow="Messages"
          title="Buyer Messages"
          subtitle="Reply to potential customers, product inquiries, and UrMall messages."
          onBack={goBackSellerScreen}
        >
          <CustomerCare />
        </SellerFullScreen>
      ) : activeScreen === "orders" ? (
        <SellerFullScreen
          eyebrow="Orders"
          title="Seller Orders"
          subtitle="Track pending, completed, cancelled, and refunded UrMall orders."
          onBack={goBackSellerScreen}
        >
          <BusinessStats initialView="orders" />
        </SellerFullScreen>
      ) : activeScreen === "notifications" ? (
        <SellerFullScreen
          eyebrow="Notifications"
          title="Seller Notifications"
          subtitle="Review items that need attention and recent activity from your store."
          onBack={goBackSellerScreen}
        >
          <div className="space-y-6">
            <BusinessAttention
              onAction={(item) => {
                if (item.id === "add-first-product") openSellerScreen("addProduct");
                if (item.type === "payout") replaceSellerScreen("dashboard");
                if (item.type === "profile") replaceSellerScreen("dashboard");
              }}
            />
            <BusinessActivity />
          </div>
        </SellerFullScreen>
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
                    if (item.id === "add-first-product") openSellerScreen("addProduct");
                    if (item.type === "payout") setActiveTab("overview");
                    if (item.type === "profile") setActiveTab("overview");
                  }}
                />
                <BusinessPromotions />
              </>
            ) : null}
            {activeTab === "sales" ? <BusinessStats /> : null}
            {activeTab === "store" ? (
              <BusinessCatalog
                mode="store"
                onEditProduct={(product) => {
                  setEditingProduct(product);
                  openSellerScreen("addProduct");
                }}
              />
            ) : null}
            {activeTab === "catalog" ? (
              <BusinessCatalog
                mode="catalog"
                onEditProduct={(product) => {
                  setEditingProduct(product);
                  openSellerScreen("addProduct");
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
