/* =========================
   MyBiz Header
========================= */
import { MessageSquare, ShieldCheck } from "lucide-react";

import MyBizHeader from "./BusinessHeader/MyBizHeader";
import MyBizMenu from "./BusinessHeader/MyBizMenu/MyBizMenu";


/* =========================
   Business UI blocks
========================= */
//import BusinessIdentity from "./BusinessIdentity/BusinessIdentity"
import BusinessAttention from "./BusinessAttention/BusinessAttention";
import BusinessActivity from "./BusinessActivity/BusinessActivity";
import BusinessCatalog from "./BusinessCatalog/BusinessCatalog";
import SellerProductDetail from "./BusinessCatalog/SellerProductDetail";
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
import { resolveSellerActivityProduct } from "../../../../Backend/services/marketplace/sellerProductService";
import { useSellerBusinessStatus } from "../../../../Backend/hooks/useSellerBusinessStatus";
import { useSellerOverview } from "../../../../Backend/hooks/useSellerOverview";
import { useEffect, useRef, useState } from "react";
import AppBackTab from "../../../shared/AppBackTab";
import AppPortal from "../../../shared/AppPortal";
import VerticalSellerDashboard from "./VerticalSellerDashboard";
import {
  MARKETPLACE_BUSINESS_CHANGED_EVENT,
  readRegisteredBusinesses,
  setActiveRegisteredBusiness,
} from "../../../../Backend/services/marketplace/sellerRegistrationService";
import { consumeSellerOrdersAreaViewReturn } from "../../../../Backend/services/marketplace/navigationHandoffService";
import { getBusinessPermissions, getAllowedWorkspaceTabs } from "../../../../Backend/services/marketplace/businessPermissions";
import { showToast } from "../../../../Backend/services/toastService";

const SELLER_SCREEN_ANIMATION_MS = 360;

function SellerFullScreen({ animation = "stack", children, hideHeader = false, eyebrow, onBack, open, subtitle, title }) {
  const animationClass = animation === "zoom"
    ? open ? "kt-route-zoom-open" : "kt-route-zoom-close"
    : open ? "kt-explore-stack-enter" : "kt-explore-stack-leave-right";

  return (
    <AppPortal>
      <section
        aria-hidden={!open}
        inert={open ? undefined : "true"}
        className={`kt-urmall-screen-panel fixed inset-0 z-[1150] flex h-dvh w-screen flex-col overflow-hidden bg-gray-50 shadow-2xl ${
          animationClass
        }`}
      >
        {!hideHeader ? (
          <header className="kt-header-glass flex h-16 shrink-0 items-center gap-3 px-3 sm:px-4">
            <AppBackTab
              onBack={onBack}
              label="Back to seller dashboard"
              historyKey={`marketplace-seller-${title}`}
              useHistoryLayer={false}
            />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-emerald-700">{eyebrow}</p>
              <h1 className="truncate text-lg font-black text-gray-950">{title}</h1>
              {subtitle ? <p className="truncate text-xs text-gray-500">{subtitle}</p> : null}
            </div>
          </header>
        ) : null}

        <main className={`min-h-0 flex-1 overflow-y-auto ${hideHeader ? "" : "px-4 py-5 sm:px-6 lg:px-8"}`}>
          {children}
        </main>
      </section>
    </AppPortal>
  );
}

export default function Business({ onBack }) {
  const { loading, hasBusiness, setHasBusiness } = useSellerBusinessStatus();
  const sellerOverview = useSellerOverview({ enabled: hasBusiness });
  const [activeScreen, setActiveScreen] = useState("dashboard");
  const [, setScreenHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [toastMessage, setToastMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuInitialScreen, setMenuInitialScreen] = useState(null);
  const [profileInitialView, setProfileInitialView] = useState("menu");
  const [editingProduct, setEditingProduct] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [visibleScreen, setVisibleScreen] = useState("dashboard");
  const [screenPanelOpen, setScreenPanelOpen] = useState(false);
  const [dashboardReveal, setDashboardReveal] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const sellerScreenTimerRef = useRef(null);

  // Returning from an order-address Area View lands directly on the orders
  // screen the seller left from.
  useEffect(() => {
    if (!consumeSellerOrdersAreaViewReturn()) return;
    setActiveScreen("orders");
  }, []);

  useEffect(() => {
    if (!hasBusiness) return undefined;
    let active = true;
    const loadBusinesses = () => readRegisteredBusinesses().then((items) => { if (active) setBusinesses(items); }).catch(() => {});
    loadBusinesses();
    window.addEventListener(MARKETPLACE_BUSINESS_CHANGED_EVENT, loadBusinesses);
    return () => {
      active = false;
      window.removeEventListener(MARKETPLACE_BUSINESS_CHANGED_EVENT, loadBusinesses);
    };
  }, [hasBusiness]);

  useEffect(() => {
    if (sellerScreenTimerRef.current) {
      window.clearTimeout(sellerScreenTimerRef.current);
      sellerScreenTimerRef.current = null;
    }

    if (activeScreen === "dashboard") {
      setScreenPanelOpen(false);
      sellerScreenTimerRef.current = window.setTimeout(() => {
        setVisibleScreen("dashboard");
        sellerScreenTimerRef.current = null;
      }, SELLER_SCREEN_ANIMATION_MS);
      return undefined;
    }

    setVisibleScreen(activeScreen);
    setScreenPanelOpen(true);
    return undefined;
  }, [activeScreen]);

  useEffect(() => {
    return () => {
      if (sellerScreenTimerRef.current) {
        window.clearTimeout(sellerScreenTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!dashboardReveal) return undefined;

    const timer = window.setTimeout(() => setDashboardReveal(null), 620);
    return () => window.clearTimeout(timer);
  }, [dashboardReveal]);

  function openProfileEditor() {
    setMenuOpen(false);
    openSellerScreen("editBusiness");
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

  function openSellerProductDetail(product) {
    if (!product) {
      setToastMessage("Product could not be opened.");
      window.setTimeout(() => setToastMessage(""), 3500);
      return;
    }

    setSelectedProduct(product);
    openSellerScreen("productDetail");
  }

  async function openProductFromActivity(activity) {
    const product = await resolveSellerActivityProduct(activity);
    openSellerProductDetail(product);
  }

  function goBackSellerScreen() {
    setScreenHistory((history) => {
      const previousScreen = history.at(-1) || "dashboard";
      setActiveScreen(previousScreen);
      return history.slice(0, -1);
    });
  }

  function renderSellerScreen() {
    if (visibleScreen === "addBusiness") {
      return (
        <SellerFullScreen key="addBusiness" hideHeader open={screenPanelOpen} onBack={goBackSellerScreen}>
          <BusinessRegistration
            mode="create"
            onExit={goBackSellerScreen}
            onComplete={() => {
              setDashboardReveal({ type: "onboarding", origin: { x: "50%", y: "70%" } });
              setVisibleScreen("dashboard");
              setScreenPanelOpen(false);
              replaceSellerScreen("dashboard");
              setToastMessage("New business workspace created successfully");
              window.setTimeout(() => setToastMessage(""), 4500);
            }}
          />
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "addProduct") {
      return (
        <SellerFullScreen key="addProduct" hideHeader open={screenPanelOpen} onBack={goBackSellerScreen}>
          <AddProductForm
            mode={editingProduct ? "edit" : "create"}
            product={editingProduct}
            onCancel={goBackSellerScreen}
            onComplete={() => {
              const wasEditing = Boolean(editingProduct);
              setDashboardReveal({ type: "bottom", origin: { x: "50%", y: "100%" } });
              setVisibleScreen("dashboard");
              setScreenPanelOpen(false);
              replaceSellerScreen("dashboard");
              setActiveTab("store");
              setEditingProduct(null);
              setToastMessage(wasEditing ? "Updated Successfully" : "Added Successfully");
              setTimeout(() => setToastMessage(""), 4500);
            }}
          />
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "productDetail") {
      return (
        <SellerFullScreen
          key="productDetail"
          animation="zoom"
          hideHeader
          open={screenPanelOpen}
          onBack={goBackSellerScreen}
        >
          <SellerProductDetail
            product={selectedProduct}
            onBack={goBackSellerScreen}
            onEdit={(product) => {
              setEditingProduct(product);
              openSellerScreen("addProduct");
            }}
          />
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "messages") {
      return (
        <SellerFullScreen
          key="messages"
          hideHeader
          onBack={goBackSellerScreen}
          open={screenPanelOpen}
        >
          <CustomerCare onBack={goBackSellerScreen} />
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "editBusiness") {
      return (
        <SellerFullScreen key="editBusiness" hideHeader open={screenPanelOpen} onBack={goBackSellerScreen}>
          <BusinessRegistration
            mode="edit"
            onExit={goBackSellerScreen}
            onComplete={() => {
              replaceSellerScreen("dashboard");
              setToastMessage("Business profile updated successfully");
              window.setTimeout(() => setToastMessage(""), 4500);
            }}
          />
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "orders") {
      return (
        <SellerFullScreen
          key="orders"
          eyebrow="Orders"
          title="Seller Orders"
          subtitle="Track pending, completed, cancelled, and refunded UrMall orders."
          onBack={goBackSellerScreen}
          open={screenPanelOpen}
        >
          <BusinessStats initialView="orders" />
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "notifications") {
      return (
        <SellerFullScreen
          key="notifications"
          eyebrow="Notifications"
          title="Seller Notifications"
          subtitle="Review items that need attention and recent activity from your store."
          onBack={goBackSellerScreen}
          open={screenPanelOpen}
        >
          <div className="space-y-6">
            <BusinessAttention
              onAction={(item) => {
                if (item.id === "add-first-product") openSellerScreen("addProduct");
                if (item.type === "payout") replaceSellerScreen("dashboard");
                if (item.type === "profile") replaceSellerScreen("dashboard");
              }}
            />
            <BusinessActivity onViewProduct={openProductFromActivity} />
          </div>
        </SellerFullScreen>
      );
    }

    return null;
  }

  const sellerDashboardHasData =
    sellerOverview.business &&
    sellerOverview.storeStatus &&
    sellerOverview.health &&
    sellerOverview.today;
  const sellerDashboardInitialLoading = hasBusiness && sellerOverview.isInitialLoading && !sellerDashboardHasData;

  const dashboardRevealClass = dashboardReveal?.type === "bottom"
    ? "kt-dashboard-grow-from-bottom"
    : dashboardReveal
      ? "kt-main-grow-from-onboarding"
      : "";
  const dashboardRevealStyle = dashboardReveal?.origin
    ? {
        "--kt-transition-x": dashboardReveal.origin.x,
        "--kt-transition-y": dashboardReveal.origin.y,
      }
    : undefined;

  const activeBusinessId = sellerOverview.business?.id || businesses[0]?.id || "";
  const activeRegisteredBusiness = businesses.find((business) => business.id === activeBusinessId) || businesses[0];
  const businessKind = sellerOverview.business?.kind || activeRegisteredBusiness?.businessKind || "retail";
  // Invited admins are limited to the responsibilities the owner turned on.
  const permissions = getBusinessPermissions(activeRegisteredBusiness);
  const allowedTabs = getAllowedWorkspaceTabs(permissions);
  const effectiveTab = allowedTabs.includes(activeTab) ? activeTab : (allowedTabs[0] || "");

  if (loading || sellerDashboardInitialLoading) {
    // The overview cache keeps stats persistent across visits, so this quiet
    // state only appears on the very first dashboard open of a session.
    return (
      <div className={`${dashboardRevealClass} min-h-screen bg-slate-50`} style={dashboardRevealStyle}>
        <div className="flex min-h-screen items-center justify-center px-6">
          <p className="text-sm font-bold text-slate-400">Opening your seller dashboard...</p>
        </div>
      </div>
    );
  }
  const verticalBusiness = {
    id: activeBusinessId,
    kind: businessKind,
    name: sellerOverview.business?.name || activeRegisteredBusiness?.identity?.businessName || "UrMall business",
    currency: sellerOverview.business?.currency || activeRegisteredBusiness?.location?.currency || "",
    countryIso: sellerOverview.business?.countryIso || activeRegisteredBusiness?.location?.countryIso || "",
    location: sellerOverview.business?.location || activeRegisteredBusiness?.location?.city || "",
  };
  const primaryActionLabel = businessKind === "restaurant" ? "Add Meal" : businessKind === "hotel" ? "Add Hotel" : businessKind === "property_agent" ? "Add Property" : "Add Product";

  return (
    <div className={`${dashboardRevealClass} min-h-screen bg-gray-50`} style={dashboardRevealStyle}>
      <ProductSuccessToast message={toastMessage} onClose={() => setToastMessage("")} />

      {/* =========================
          MyBiz Header (ONLY PLACE)
      ========================= */}
      {hasBusiness ? (
        <MyBizHeader
          activeBusinessId={activeBusinessId}
          businesses={businesses}
          onAddBusiness={() => openSellerScreen("addBusiness")}
          onBack={onBack}
          onAddProduct={() => {
            if (!permissions.canAddProducts) {
              showToast("Your admin role does not include adding or editing listings.", "info");
              return;
            }
            if (businessKind !== "retail") {
              window.dispatchEvent(new CustomEvent("marketplace-open-vertical-editor"));
              return;
            }
            setEditingProduct(null);
            openSellerScreen("addProduct");
          }}
          onOrders={() => {
            if (!permissions.canAccessDashboard) {
              showToast("Your admin role does not include order and dashboard access.", "info");
              return;
            }
            openSellerScreen("orders");
          }}
          onMessages={() => {
            if (!permissions.canReplyMessages) {
              showToast("Your admin role does not include replying to messages.", "info");
              return;
            }
            openSellerScreen("messages");
          }}
          onAlerts={() => {
            if (!permissions.canAccessDashboard) return;
            openSellerScreen("notifications");
          }}
          onMenu={openSellerMenu}
          onSwitchBusiness={async (businessId) => {
            await setActiveRegisteredBusiness(businessId);
            setActiveTab("overview");
            setToastMessage("Business workspace switched");
            window.setTimeout(() => setToastMessage(""), 2500);
          }}
          primaryActionLabel={primaryActionLabel}
          showAddProduct={permissions.canAddProducts}
          showMessages={permissions.canReplyMessages}
          showOrders={permissions.canAccessDashboard && ["retail", "restaurant"].includes(businessKind)}
        />
      ) : null}

      {hasBusiness ? (
        <MyBizMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          initialScreenKey={menuInitialScreen}
          profileInitialView={profileInitialView}
          onAddBusiness={() => openSellerScreen("addBusiness")}
          permissions={permissions}
        />
      ) : null}

      {!hasBusiness ? (
        <BusinessRegistration
          onComplete={(_business, origin) => {
            setDashboardReveal({ type: "onboarding", origin: origin || { x: "50%", y: "70%" } });
            setHasBusiness(true);
          }}
          onExit={onBack}
        />
      ) : (
        <>

      {/* =========================
          Business content
      ========================= */}
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <div>
          <main className="space-y-6">
            {permissions.canAccessDashboard ? (
              <MyBizDashboardHeader onEditProfile={openProfileEditor} overview={sellerOverview} />
            ) : null}

            {permissions.isAdmin ? (
              <AdminRoleBanner permissions={permissions} />
            ) : null}

            {!(permissions.canAccessDashboard || permissions.canAddProducts) ? (
              <AdminLimitedCard
                permissions={permissions}
                onOpenMessages={() => openSellerScreen("messages")}
              />
            ) : businessKind === "retail" ? (
              <>
                {allowedTabs.length ? (
                  <SellerWorkspaceTabs activeTab={effectiveTab} onTabChange={setActiveTab} allowedTabs={allowedTabs} />
                ) : null}
                {effectiveTab === "overview" ? (
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
                {effectiveTab === "sales" ? <BusinessStats /> : null}
                {effectiveTab === "store" ? (
                    <BusinessCatalog
                      mode="store"
                      onViewProduct={openSellerProductDetail}
                      onEditProduct={(product) => {
                        setEditingProduct(product);
                        openSellerScreen("addProduct");
                    }}
                  />
                ) : null}
                {effectiveTab === "catalog" ? (
                    <BusinessCatalog
                      mode="catalog"
                      onViewProduct={openSellerProductDetail}
                      onEditProduct={(product) => {
                        setEditingProduct(product);
                        openSellerScreen("addProduct");
                    }}
                  />
                ) : null}
                {effectiveTab === "drafts" ? (
                    <BusinessCatalog
                      mode="drafts"
                      onViewProduct={openSellerProductDetail}
                      onEditProduct={(product) => {
                        setEditingProduct(product);
                        openSellerScreen("addProduct");
                    }}
                  />
                ) : null}
              </>
            ) : (
              <VerticalSellerDashboard business={verticalBusiness} canManage={permissions.canAddProducts} />
            )}
          </main>
        </div>
      </div>
        </>
      )}

      {hasBusiness && visibleScreen !== "dashboard" ? renderSellerScreen() : null}

    </div>
  );
}

// Shows an admin exactly which responsibilities the owner granted, so the
// limited workspace never looks broken.
function AdminRoleBanner({ permissions }) {
  const abilities = [
    permissions.canAddProducts ? "add & edit listings" : null,
    permissions.canReplyMessages ? "reply to messages" : null,
    permissions.canAccessDashboard ? "view orders & dashboard" : null,
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700">
        <ShieldCheck size={17} />
      </span>
      <p className="text-sm font-semibold leading-6 text-violet-900">
        You are an admin of this business.{" "}
        {abilities.length
          ? <>Your role covers: <span className="font-black">{abilities.join(", ")}</span>.</>
          : "The owner has not assigned you any responsibilities yet."}
      </p>
    </div>
  );
}

// Landing card for admins whose only responsibility is replying to messages
// (or who have nothing assigned yet) — the dashboard/catalog stay hidden.
function AdminLimitedCard({ permissions, onOpenMessages }) {
  return (
    <div className="rounded-[24px] border border-dashed border-gray-300 bg-white p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-gray-500">
        <ShieldCheck size={22} />
      </span>
      {permissions.canReplyMessages ? (
        <>
          <p className="mt-3 text-base font-black text-gray-950">You can reply to buyer messages</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-gray-500">
            Your admin role is limited to answering messages for this store.
          </p>
          <button
            type="button"
            onClick={onOpenMessages}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white"
          >
            <MessageSquare size={16} /> Open messages
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 text-base font-black text-gray-950">No responsibilities assigned yet</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-gray-500">
            The business owner has not given you any admin responsibilities. Ask them to assign what you should handle.
          </p>
        </>
      )}
    </div>
  );
}
