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
import BusinessSkeleton from "./BusinessSkeleton";
import VerticalSellerDashboard from "./VerticalSellerDashboard";
import {
  MARKETPLACE_BUSINESS_CHANGED_EVENT,
  readRegisteredBusinesses,
  setActiveRegisteredBusiness,
} from "../../../../Backend/services/marketplace/sellerRegistrationService";

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
              setToastMessage(wasEditing ? "Product listing updated successfully" : "Product added successfully");
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

  if (loading || sellerDashboardInitialLoading) {
    return (
      <div className={`${dashboardRevealClass} min-h-screen`} style={dashboardRevealStyle}>
        <BusinessSkeleton />
      </div>
    );
  }

  const activeBusinessId = sellerOverview.business?.id || businesses[0]?.id || "";
  const activeRegisteredBusiness = businesses.find((business) => business.id === activeBusinessId) || businesses[0];
  const businessKind = sellerOverview.business?.kind || activeRegisteredBusiness?.businessKind || "retail";
  const verticalBusiness = {
    id: activeBusinessId,
    kind: businessKind,
    name: sellerOverview.business?.name || activeRegisteredBusiness?.identity?.businessName || "UrMall business",
    currency: sellerOverview.business?.currency || activeRegisteredBusiness?.location?.currency || "",
    countryIso: sellerOverview.business?.countryIso || activeRegisteredBusiness?.location?.countryIso || "",
    location: sellerOverview.business?.location || activeRegisteredBusiness?.location?.city || "",
  };
  const primaryActionLabel = businessKind === "restaurant" ? "Add Meal" : businessKind === "hotel" ? "Add Room" : businessKind === "property_agent" ? "Add Property" : "Add Product";

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
            if (businessKind !== "retail") {
              window.dispatchEvent(new CustomEvent("marketplace-open-vertical-editor"));
              return;
            }
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
          onSwitchBusiness={async (businessId) => {
            await setActiveRegisteredBusiness(businessId);
            setActiveTab("overview");
            setToastMessage("Business workspace switched");
            window.setTimeout(() => setToastMessage(""), 2500);
          }}
          primaryActionLabel={primaryActionLabel}
        />
      ) : null}

      {hasBusiness ? (
        <MyBizMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          initialScreenKey={menuInitialScreen}
          profileInitialView={profileInitialView}
          onAddBusiness={() => openSellerScreen("addBusiness")}
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
            <MyBizDashboardHeader onEditProfile={openProfileEditor} overview={sellerOverview} />
            {businessKind === "retail" ? <SellerWorkspaceTabs activeTab={activeTab} onTabChange={setActiveTab} /> : null}
            {businessKind !== "retail" ? <VerticalSellerDashboard business={verticalBusiness} /> : null}
            {businessKind === "retail" && activeTab === "overview" ? (
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
            {businessKind === "retail" && activeTab === "sales" ? <BusinessStats /> : null}
            {businessKind === "retail" && activeTab === "store" ? (
                <BusinessCatalog
                  mode="store"
                  onViewProduct={openSellerProductDetail}
                  onEditProduct={(product) => {
                    setEditingProduct(product);
                    openSellerScreen("addProduct");
                }}
              />
            ) : null}
            {businessKind === "retail" && activeTab === "catalog" ? (
                <BusinessCatalog
                  mode="catalog"
                  onViewProduct={openSellerProductDetail}
                  onEditProduct={(product) => {
                    setEditingProduct(product);
                    openSellerScreen("addProduct");
                }}
              />
            ) : null}
            {businessKind === "retail" && activeTab === "drafts" ? (
                <BusinessCatalog
                  mode="drafts"
                  onViewProduct={openSellerProductDetail}
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

      {hasBusiness && visibleScreen !== "dashboard" ? renderSellerScreen() : null}

    </div>
  );
}
