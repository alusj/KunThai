/* =========================
   MyBiz Header
========================= */
import { ArrowLeft, Bell, Menu, MessageSquare, PackageCheck, Plus, ShieldCheck, Store } from "lucide-react";

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
import ProductInsightsScreen from "./BusinessCatalog/ProductInsightsScreen";
import ProductPromotionScreen from "./BusinessCatalog/ProductPromotionScreen";
import BusinessPromotions from "./BusinessPromotions/BusinessPromotions";
import CustomerCare from "./CustomerCare/CustomerCare";
import MyBizDashboardHeader from "./MyBizDashboardHeader/MyBizDashboardHeader";
import TodaySummaryCard from "./MyBizDashboardHeader/TodaySummaryCard";
import SellerIntelligence from "./SellerIntelligence/SellerIntelligence";
import BusinessStats from "./BusinessStats/BusinessStats";
import AddProductForm from "./ProductForm/AddProductForm";
import SellerWorkspaceTabs from "./SellerWorkspaceTabs";
import ProductSuccessToast from "./ProductSuccessToast";
//import RecentOrders from "./RecentOrders";
//import RecentMessages from "./RecentMessages";
import BusinessRegistration from "./BusinessRegistration/BusinessRegistration";
import SubscriptionPlans from "./BusinessHeader/MyBizMenu/MyBizPages/SubscriptionPlans/SubscriptionPlans";
import PlanFeatureGate from "../../../shared/PlanFeatureGate";
import { resolveSellerActivityProduct } from "../../../../Backend/services/marketplace/sellerProductService";
import { BUSINESS_PLAN_UPDATED_EVENT, fetchBusinessSubscription, planTierMeets } from "../../../../Backend/services/businessSubscriptionService";
import { useSellerBusinessStatus } from "../../../../Backend/hooks/useSellerBusinessStatus";
import { useSellerOverview } from "../../../../Backend/hooks/useSellerOverview";
import { useNavigationStack } from "../../../../Backend/hooks/useNavigationStack";
import { useEffect, useRef, useState } from "react";
import { useBrowserBack } from "../../../../Backend/hooks/useBrowserBack";
import AppBackTab from "../../../shared/AppBackTab";
import AppPortal from "../../../shared/AppPortal";
import useBodyScrollLock from "../../../shared/useBodyScrollLock";
import VerticalSellerDashboard from "./VerticalSellerDashboard";
import {
  MARKETPLACE_BUSINESS_CHANGED_EVENT,
  readCachedActiveRegisteredBusinessId,
  readRegisteredBusinesses,
  setActiveRegisteredBusiness,
} from "../../../../Backend/services/marketplace/sellerRegistrationService";
import { consumeSellerOrdersAreaViewReturn } from "../../../../Backend/services/marketplace/navigationHandoffService";
import { getBusinessPermissions, getAllowedWorkspaceTabs } from "../../../../Backend/services/marketplace/businessPermissions";
import { requestOpenVerticalEditor } from "../../../../Backend/services/marketplace/verticalEditorBus";
import { showToast } from "../../../../Backend/services/toastService";
import { useI18n, t } from "../../../../i18n";

const SELLER_SCREEN_ANIMATION_MS = 360;

function SellerFullScreen({ animation = "stack", children, hideHeader = false, eyebrow, onBack, open, subtitle, title }) {
  const animationClass = animation === "zoom"
    ? open ? "kt-route-zoom-open" : "kt-route-zoom-close"
    : open ? "kt-explore-stack-enter" : "kt-explore-stack-leave-right";

  // Lock the page behind this full-screen panel so scrolling stays inside the
  // panel — otherwise the background body scrollbar bleeds through and the
  // caution card feels blocked.
  useBodyScrollLock(open);

  return (
    <AppPortal>
      <section
        aria-hidden={!open}
        inert={open ? undefined : "true"}
        className={`kt-urmall-screen-panel fixed inset-0 z-[1150] flex w-screen flex-col overflow-hidden bg-gray-50 shadow-2xl ${
          animationClass
        }`}
      >
        {!hideHeader ? (
          <header className="kt-header-glass flex h-16 shrink-0 items-center gap-3 px-3 sm:px-4">
            <AppBackTab
              onBack={onBack}
              label={t("urmall.biz.reg.backToDashboard")}
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

        <main className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${hideHeader ? "" : "px-4 py-5 sm:px-6 lg:px-8"}`}>
          {children}
        </main>
      </section>
    </AppPortal>
  );
}

export default function Business({ initialScreen = "", onBack, onInitialScreenHandled }) {
  useI18n();
  const { loading, hasBusiness, setHasBusiness } = useSellerBusinessStatus();
  const sellerOverview = useSellerOverview({ enabled: hasBusiness });
  const sellerNavigation = useNavigationStack("dashboard");
  const activeScreen = sellerNavigation.current.screen;
  const [activeTab, setActiveTab] = useState("store");
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
  const [selectedBusinessId, setSelectedBusinessId] = useState(() => readCachedActiveRegisteredBusinessId());
  const [sellerPlan, setSellerPlan] = useState({ planCode: "free", planName: "Free", available: false });
  const [switchingBusiness, setSwitchingBusiness] = useState(false);
  const switchTargetRef = useRef(null);
  const pendingSwitchToastRef = useRef(false);
  const sellerScreenTimerRef = useRef(null);
  const popSellerScreen = sellerNavigation.pop;
  const pushSellerScreen = sellerNavigation.push;
  const sellerCurrentEntry = sellerNavigation.current;
  const goBackSellerScreen = useBrowserBack(
    sellerNavigation.canPop,
    popSellerScreen,
    `marketplace-seller-${sellerNavigation.entries.length}-${activeScreen}`,
  );

  // Keeps the switch animation up until the newly selected business AND its
  // dashboard data have loaded, so the seller never sees the empty skeleton
  // cards flash after switching. A safety cap stops a slow/never-resolving
  // overview from trapping the overlay. The "switched" toast is announced only
  // once the overlay closes, so it appears after the animation instead of
  // sitting behind it.
  // The current plan tier drives both the dashboard "PLAN · <tier>" pill and
  // the Pro/Premium feature locks. Fetched once here so the header and the
  // catalog share a single lookup, and refreshed when a plan change fires.
  const planEntityId = sellerOverview.business?.id || "";
  useEffect(() => {
    if (!planEntityId) return undefined;
    let alive = true;
    function loadPlan() {
      fetchBusinessSubscription("urmall", planEntityId)
        .then((state) => {
          if (!alive) return;
          setSellerPlan({
            planCode: state?.entitlement?.planCode || "free",
            planName: state?.entitlement?.planName || "Free",
            available: state?.available !== false,
          });
        })
        .catch(() => null);
    }
    loadPlan();

    function handlePlanUpdate(event) {
      const detail = event.detail || {};
      if (detail.surface === "urmall" && detail.entityId === planEntityId) loadPlan();
    }
    window.addEventListener(BUSINESS_PLAN_UPDATED_EVENT, handlePlanUpdate);
    return () => {
      alive = false;
      window.removeEventListener(BUSINESS_PLAN_UPDATED_EVENT, handlePlanUpdate);
    };
  }, [planEntityId]);

  const productInsightsLocked = sellerPlan.available && !planTierMeets(sellerPlan.planCode, "pro");

  useEffect(() => {
    if (!switchingBusiness) return undefined;

    const businessArrived = switchTargetRef.current && sellerOverview.business?.id === switchTargetRef.current;
    const dashboardReady =
      businessArrived && Boolean(sellerOverview.storeStatus && sellerOverview.health && sellerOverview.today);

    function closeAndAnnounce() {
      setSwitchingBusiness(false);
      if (pendingSwitchToastRef.current) {
        pendingSwitchToastRef.current = false;
        setToastMessage(t("urmall.biz.dash.bizSwitched"));
        window.setTimeout(() => setToastMessage(""), 2500);
      }
    }

    const delay = dashboardReady ? 220 : businessArrived ? 1500 : 4000;
    const timer = window.setTimeout(closeAndAnnounce, delay);
    return () => window.clearTimeout(timer);
  }, [
    switchingBusiness,
    sellerOverview.business?.id,
    sellerOverview.storeStatus,
    sellerOverview.health,
    sellerOverview.today,
  ]);

  // Returning from an order-address Area View lands directly on the orders
  // screen the seller left from.
  useEffect(() => {
    if (!consumeSellerOrdersAreaViewReturn()) return;
    pushSellerScreen({ screen: "orders", state: { restoredFromAreaView: true } });
  }, [pushSellerScreen]);

  useEffect(() => {
    if (!hasBusiness || !initialScreen) return;
    if (activeScreen !== initialScreen) {
      pushSellerScreen({ screen: initialScreen, state: { openedFromNotification: true } });
    }
    onInitialScreenHandled?.();
  }, [activeScreen, hasBusiness, initialScreen, onInitialScreenHandled, pushSellerScreen]);

  useEffect(() => {
    if (!hasBusiness) return undefined;
    let active = true;
    const loadBusinesses = () => readRegisteredBusinesses().then((items) => {
      if (!active) return;
      setBusinesses(items);
      const cachedActiveId = readCachedActiveRegisteredBusinessId();
      const nextActiveId = items.find((item) => item.id === cachedActiveId)?.id
        || items.find((item) => item.id === sellerOverview.business?.id)?.id
        || items[0]?.id
        || "";
      if (nextActiveId) setSelectedBusinessId(nextActiveId);
    }).catch(() => {});
    loadBusinesses();
    window.addEventListener(MARKETPLACE_BUSINESS_CHANGED_EVENT, loadBusinesses);
    return () => {
      active = false;
      window.removeEventListener(MARKETPLACE_BUSINESS_CHANGED_EVENT, loadBusinesses);
    };
  }, [hasBusiness, sellerOverview.business?.id]);

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

  useEffect(() => {
    const entryState = sellerCurrentEntry.state;
    if (entryState?.activeTab) setActiveTab(entryState.activeTab);
    if (entryState?.selectedProduct) setSelectedProduct(entryState.selectedProduct);
  }, [sellerCurrentEntry]);

  function openProfileEditor() {
    setMenuOpen(false);
    openSellerScreen("editBusiness");
  }

  function openDelegatedProfileEditor() {
    setMenuInitialScreen("profile");
    setProfileInitialView("menu");
    setMenuOpen(true);
  }

  function openSellerMenu() {
    setMenuInitialScreen(null);
    setProfileInitialView("menu");
    setMenuOpen(true);
  }

  function openSellerScreen(screen, options = {}) {
    if (activeScreen === screen) return;
    sellerNavigation.push({
      screen,
      params: options.params || (selectedProduct?.id ? { productId: selectedProduct.id } : {}),
      state: {
        activeTab,
        ...(selectedProduct ? { selectedProduct } : {}),
        ...(options.state || {}),
      },
    });
  }

  function replaceSellerScreen(screen) {
    sellerNavigation.reset({ screen, state: { activeTab } });
  }

  function openSellerProductDetail(product) {
    if (!product) {
      setToastMessage(t("urmall.biz.dash.productOpenFail"));
      window.setTimeout(() => setToastMessage(""), 3500);
      return;
    }

    setSelectedProduct(product);
    openSellerScreen("productDetail", { params: { productId: product.id }, state: { selectedProduct: product } });
  }

  function openProductInsights(product) {
    if (!product) return;
    setSelectedProduct(product);
    openSellerScreen("productInsights", { params: { productId: product.id }, state: { selectedProduct: product } });
  }

  function openProductPromotion(product) {
    if (!product) return;
    setSelectedProduct(product);
    openSellerScreen("productPromotion", { params: { productId: product.id }, state: { selectedProduct: product } });
  }

  async function openProductFromActivity(activity) {
    const product = await resolveSellerActivityProduct(activity);
    if (activity?.actionTarget === "seller-product-insights") {
      openProductInsights(product);
      return;
    }
    openSellerProductDetail(product);
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
              setToastMessage(t("urmall.biz.dash.bizCreated"));
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
              setToastMessage(wasEditing ? t("urmall.biz.dash.updatedSuccess") : t("urmall.biz.dash.addedSuccess"));
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
              setToastMessage(t("urmall.biz.dash.bizUpdated"));
              window.setTimeout(() => setToastMessage(""), 4500);
            }}
          />
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "plans") {
      return (
        <SellerFullScreen key="plans" hideHeader open={screenPanelOpen} onBack={goBackSellerScreen}>
          <SubscriptionPlans onBack={goBackSellerScreen} />
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "orders") {
      return (
        <SellerFullScreen
          key="orders"
          eyebrow={t("urmall.biz.board.items.ordersT")}
          title={t("urmall.biz.dash.sellerOrders")}
          subtitle={t("urmall.biz.board.items.ordersD")}
          onBack={goBackSellerScreen}
          open={screenPanelOpen}
        >
          <BusinessStats initialView="orders" />
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "productInsights") {
      return (
        <SellerFullScreen
          key="productInsights"
          eyebrow={`${t("urmall.biz.cat.productKicker")} ${t("urmall.biz.intel.insightsTab")}`}
          title={selectedProduct?.name || t("urmall.biz.intel.insightsTab")}
          subtitle={t("urmall.biz.ins.subtitle")}
          onBack={goBackSellerScreen}
          open={screenPanelOpen}
        >
          <div className="kt-seller-screen-content mx-auto w-full max-w-5xl">
            <PlanFeatureGate
              surface="urmall"
              entityId={sellerOverview.business?.id}
              requiredTier="pro"
              featureName={t("urmall.biz.intel.insightsTab")}
              description="Advanced product insights are part of the Pro plan. Upgrade to see per-product performance."
              onOpenPlans={() => openSellerScreen("plans")}
            >
              <ProductInsightsScreen product={selectedProduct} />
            </PlanFeatureGate>
          </div>
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "productPromotion") {
      return (
        <SellerFullScreen
          key="productPromotion"
          eyebrow={t("urmall.biz.promo.kicker")}
          title={selectedProduct?.name || t("urmall.biz.cat.promote")}
          subtitle={t("urmall.biz.promo.plannerSubtitle")}
          onBack={goBackSellerScreen}
          open={screenPanelOpen}
        >
          <div className="kt-seller-screen-content mx-auto w-full max-w-3xl">
            <ProductPromotionScreen
              product={selectedProduct}
              onPromoted={(settings) => {
                goBackSellerScreen();
                setToastMessage(`Promotion started with ${settings.promotionCredits} Visibility Credits.`);
                window.setTimeout(() => setToastMessage(""), 4500);
              }}
            />
          </div>
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "todaySummary") {
      return (
        <SellerFullScreen
          key="todaySummary"
          eyebrow={sellerOverview.business?.name}
          title={t("urmall.biz.dash.todaySummary")}
          subtitle={t("urmall.biz.dash.liveSnapshot")}
          onBack={goBackSellerScreen}
          open={screenPanelOpen}
        >
          <div className="kt-seller-screen-content mx-auto w-full max-w-5xl">
            <TodaySummaryCard today={sellerOverview.today} />
          </div>
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "sellerIntelligence") {
      return (
        <SellerFullScreen
          key="sellerIntelligence"
          eyebrow={sellerOverview.business?.name}
          title={t("urmall.biz.intel.title")}
          subtitle={t("urmall.biz.intel.subtitle")}
          onBack={goBackSellerScreen}
          open={screenPanelOpen}
        >
          <div className="kt-seller-screen-content mx-auto w-full max-w-5xl">
            <PlanFeatureGate
              surface="urmall"
              entityId={sellerOverview.business?.id}
              requiredTier="premium"
              featureName={t("urmall.biz.intel.title")}
              description="Full business insights are part of the Premium plan. Upgrade to unlock Seller Intelligence."
              onOpenPlans={() => openSellerScreen("plans")}
            >
              <SellerIntelligence />
            </PlanFeatureGate>
          </div>
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "overview") {
      return (
        <SellerFullScreen
          key="overview"
          eyebrow={sellerOverview.business?.name}
          title={t("urmall.biz.dash.tabOverview")}
          subtitle={t("urmall.biz.actv.subtitle")}
          onBack={goBackSellerScreen}
          open={screenPanelOpen}
        >
          <div className="kt-seller-screen-content mx-auto w-full max-w-5xl space-y-5">
            <BusinessAttention
              onAction={(item) => {
                if (item.id === "add-first-product") openSellerScreen("addProduct");
                if (item.type === "profile") openSellerScreen("editBusiness");
              }}
            />
            <BusinessActivity onViewProduct={openProductFromActivity} />
          </div>
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "sales") {
      return (
        <SellerFullScreen
          key="sales"
          eyebrow={sellerOverview.business?.name}
          title={t("urmall.biz.stats.salesOrders")}
          subtitle={t("urmall.biz.stats.salesOrdersDesc")}
          onBack={goBackSellerScreen}
          open={screenPanelOpen}
        >
          <div className="kt-seller-screen-content mx-auto w-full max-w-5xl">
            <BusinessStats />
          </div>
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "promotions") {
      return (
        <SellerFullScreen
          key="promotions"
          eyebrow={sellerOverview.business?.name}
          title={t("urmall.biz.board.items.promotionsT")}
          subtitle={t("urmall.biz.board.items.promotionsD")}
          onBack={goBackSellerScreen}
          open={screenPanelOpen}
        >
          <div className="kt-seller-screen-content mx-auto w-full max-w-5xl">
            <BusinessPromotions />
          </div>
        </SellerFullScreen>
      );
    }

    if (visibleScreen === "notifications") {
      return (
        <SellerFullScreen
          key="notifications"
          eyebrow={t("urmall.biz.dash.notifications")}
          title={t("urmall.biz.dash.sellerNotifications")}
          subtitle={t("urmall.biz.dash.notificationsSubtitle")}
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

  const activeBusinessId = selectedBusinessId || sellerOverview.business?.id || businesses[0]?.id || "";
  const activeRegisteredBusiness = businesses.find((business) => business.id === activeBusinessId) || businesses[0];
  const businessKind = sellerOverview.business?.kind || activeRegisteredBusiness?.businessKind || "retail";
  // Invited admins are limited to the responsibilities the owner turned on.
  const permissions = getBusinessPermissions(activeRegisteredBusiness);
  const allowedTabs = getAllowedWorkspaceTabs(permissions);
  const effectiveTab = allowedTabs.includes(activeTab) ? activeTab : (allowedTabs[0] || "");

  if (loading || sellerDashboardInitialLoading) {
    // The overview cache keeps stats persistent across visits, so this quiet
    // state only appears on the very first dashboard open of a session. A single
    // skeleton — header (with a placeholder where the business switcher sits)
    // plus the dashboard cards — stands in for the real layout instead of a
    // "Opening dashboard" line.
    return (
      <div className={`${dashboardRevealClass} kt-mobile-viewport kt-safe-screen bg-gray-50`} style={dashboardRevealStyle} aria-busy="true">
        <SellerDashboardSkeleton onBack={onBack} />
      </div>
    );
  }
  const verticalBusiness = {
    id: activeBusinessId,
    kind: businessKind,
    name: sellerOverview.business?.name || activeRegisteredBusiness?.identity?.businessName || t("urmall.biz.dash.urmallBusiness"),
    currency: sellerOverview.business?.currency || activeRegisteredBusiness?.location?.currency || "",
    countryIso: sellerOverview.business?.countryIso || activeRegisteredBusiness?.location?.countryIso || "",
    location: sellerOverview.business?.location || activeRegisteredBusiness?.location?.city || "",
  };
  const primaryActionLabel = businessKind === "restaurant" ? t("urmall.biz.dash.addMeal") : businessKind === "hotel" ? t("urmall.biz.dash.addHotel") : businessKind === "property_agent" ? t("urmall.biz.dash.addProperty") : t("urmall.biz.header.addProduct");

  return (
    <div className={`${dashboardRevealClass} kt-mobile-viewport kt-safe-screen bg-gray-50`} style={dashboardRevealStyle}>
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
              showToast(t("urmall.biz.dash.noAddPerm"), "info");
              return;
            }
            if (businessKind !== "retail") {
              requestOpenVerticalEditor();
              return;
            }
            setEditingProduct(null);
            openSellerScreen("addProduct");
          }}
          onOrders={() => {
            if (!permissions.canAccessDashboard) {
              showToast(t("urmall.biz.dash.noDashPerm"), "info");
              return;
            }
            openSellerScreen("orders");
          }}
          onMessages={() => {
            if (!permissions.canReplyMessages) {
              showToast(t("urmall.biz.dash.noMsgPerm"), "info");
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
            const previousBusinessId = activeBusinessId;
            if (businessId && businessId !== activeBusinessId) {
              switchTargetRef.current = businessId;
              pendingSwitchToastRef.current = true;
              setSelectedBusinessId(businessId);
              setSwitchingBusiness(true);
            }
            try {
              await setActiveRegisteredBusiness(businessId);
              setActiveTab("store");
            } catch (error) {
              setSelectedBusinessId(previousBusinessId);
              setSwitchingBusiness(false);
              pendingSwitchToastRef.current = false;
              showToast(error.message || "Unable to switch businesses right now.", "danger");
            }
            // The "switched" toast is announced once the switch overlay closes
            // (see the switchingBusiness effect), so it never sits behind the
            // animation.
          }}
          primaryActionLabel={primaryActionLabel}
          showAddProduct={permissions.canAddProducts}
          showMessages={permissions.canReplyMessages}
          showOrders={permissions.canAccessDashboard && ["retail", "restaurant"].includes(businessKind)}
        />
      ) : null}

      {switchingBusiness ? (
        <BusinessSwitchOverlay name={businesses.find((business) => business.id === switchTargetRef.current)?.identity?.businessName || ""} />
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
              <MyBizDashboardHeader
                onEditProfile={() => {
                  if (!permissions.canEditBusiness) {
                    showToast("The business owner has not assigned you responsibility for editing business information.", "info");
                    return;
                  }
                  if (permissions.isAdmin) openDelegatedProfileEditor();
                  else openProfileEditor();
                }}
                onOpenSection={openSellerScreen}
                onOpenPlans={permissions.canManagePlans ? () => openSellerScreen("plans") : undefined}
                overview={sellerOverview}
                planName={sellerPlan.planName}
                planCode={sellerPlan.planCode}
                planAvailable={sellerPlan.available}
              />
            ) : null}

            {permissions.isAdmin ? (
              <AdminRoleBanner permissions={permissions} />
            ) : null}

            {!(permissions.canAccessDashboard || permissions.canAddProducts) ? (
              <AdminLimitedCard
                permissions={permissions}
                onOpenMessages={() => openSellerScreen("messages")}
                onEditBusiness={openDelegatedProfileEditor}
                onOpenPlans={() => openSellerScreen("plans")}
              />
            ) : businessKind === "retail" ? (
              <>
                {allowedTabs.length ? (
                  <SellerWorkspaceTabs activeTab={effectiveTab} onTabChange={setActiveTab} allowedTabs={allowedTabs} />
                ) : null}
                <div key={effectiveTab} className="kt-seller-detail-swap">
                  {effectiveTab === "store" ? (
                    <BusinessCatalog
                      mode="store"
                      onPromoteProduct={openProductPromotion}
                      onViewInsights={openProductInsights}
                      insightsLocked={productInsightsLocked}
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
                      onPromoteProduct={openProductPromotion}
                      onViewInsights={openProductInsights}
                      insightsLocked={productInsightsLocked}
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
                      onPromoteProduct={openProductPromotion}
                      onViewInsights={openProductInsights}
                      insightsLocked={productInsightsLocked}
                      onViewProduct={openSellerProductDetail}
                      onEditProduct={(product) => {
                        setEditingProduct(product);
                        openSellerScreen("addProduct");
                    }}
                  />
                  ) : null}
                </div>
              </>
            ) : (
              <VerticalSellerDashboard
                business={verticalBusiness}
                canManage={permissions.canAddProducts}
                initialWorkspace={sellerOverview.verticalWorkspace}
              />
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

// The seller shell itself is stable UI, so only the business switcher and the
// server-backed listing cards shimmer. Header actions, workspace tabs, and the
// dashboard information cards must not masquerade as loading data.
function SellerDashboardSkeleton({ onBack }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white" data-static-shell="seller-header">
        <div className="flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gray-200 bg-white text-gray-700"
              aria-label={t("common.back")}
            >
              <ArrowLeft size={19} />
            </button>
            <span className="hidden truncate text-sm font-semibold text-gray-900 sm:block">
              {t("urmall.biz.header.sellerDashboard")}
            </span>
          </div>

          <div
            className="kt-startup-shimmer h-10 w-16 shrink-0 rounded-xl border border-emerald-200"
            data-loading-region="business-switcher"
            aria-hidden="true"
          />

          <div className="flex items-center gap-2 text-gray-700" aria-hidden="true">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-gray-950 text-white"><Plus size={18} /></span>
            <span className="hidden h-10 w-10 place-items-center rounded-lg border border-gray-200 bg-white min-[390px]:grid"><PackageCheck size={18} /></span>
            <span className="hidden h-10 w-10 place-items-center rounded-lg border border-gray-200 bg-white min-[440px]:grid"><MessageSquare size={18} /></span>
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 bg-white"><Bell size={18} /></span>
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 bg-white"><Menu size={19} /></span>
          </div>
        </div>
      </header>
      <div className="w-full space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <nav className="grid grid-cols-3 gap-1.5 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm" data-static-shell="seller-tabs">
          {[
            t("urmall.biz.cat.titleStore"),
            t("urmall.biz.cat.titleCatalog"),
            t("urmall.biz.cat.titleDraft"),
          ].map((label, index) => (
            <span key={label} className={`grid min-h-10 place-items-center rounded-xl px-2 text-xs font-black ${index === 0 ? "bg-slate-950 text-white" : "text-gray-500"}`}>
              {label}
            </span>
          ))}
        </nav>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-loading-region="seller-items">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="overflow-hidden rounded-[20px] border border-gray-200 bg-white">
              <div className="kt-startup-shimmer aspect-[4/3] w-full" />
              <div className="space-y-2 p-3">
                <div className="kt-startup-shimmer h-4 w-4/5 rounded-full" />
                <div className="kt-startup-shimmer h-3 w-1/2 rounded-full" />
                <div className="kt-startup-shimmer h-5 w-2/5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Covers the dashboard while a business switch is in flight so the seller never
// sees the previous business type linger. Its ping ring, popping card, and
// bouncing dots give the wait a deliberate, branded feel.
//
// Rendered through AppPortal so its `fixed inset-0` is measured against the
// viewport, not an animated/transformed ancestor — otherwise the card drifts
// off-centre or is clipped. z-index sits above the sticky header (z-30) so the
// animation is never partially hidden behind it.
function BusinessSwitchOverlay({ name }) {
  return (
    <AppPortal>
      <div className="kt-detail-backdrop-enter fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm">
        <div className="kt-detail-zoom-enter flex w-full max-w-xs flex-col items-center gap-5 rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 px-8 py-8 text-center shadow-2xl">
          <span className="relative grid h-16 w-16 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-2xl bg-emerald-500/40" />
            <span className="relative grid h-16 w-16 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-300">
              <Store size={28} />
            </span>
          </span>
          <div>
            <p className="text-sm font-black text-white">{t("urmall.biz.dash.switchingBusiness")}</p>
            {name ? <p className="mt-1 truncate text-xs font-bold text-emerald-300">{name}</p> : null}
            <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden="true">
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppPortal>
  );
}

// Shows an admin exactly which responsibilities the owner granted, so the
// limited workspace never looks broken.
function AdminRoleBanner({ permissions }) {
  const abilities = [
    permissions.canAddProducts ? t("urmall.biz.dash.abAddEdit") : null,
    permissions.canReplyMessages ? t("urmall.biz.dash.abReply") : null,
    permissions.canAccessDashboard ? t("urmall.biz.dash.abView") : null,
    permissions.canEditBusiness ? "edit business information" : null,
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700">
        <ShieldCheck size={17} />
      </span>
      <p className="text-sm font-semibold leading-6 text-violet-900">
        {t("urmall.biz.dash.adminBannerLead")}{" "}
        {abilities.length
          ? <>{t("urmall.biz.dash.roleCoversPrefix")} <span className="font-black">{abilities.join(", ")}</span>.</>
          : t("urmall.biz.dash.noResponsibilities")}
      </p>
    </div>
  );
}

// Landing card for admins whose only responsibility is replying to messages
// (or who have nothing assigned yet) — the dashboard/catalog stay hidden.
function AdminLimitedCard({ permissions, onOpenMessages, onEditBusiness, onOpenPlans }) {
  return (
    <div className="rounded-[24px] border border-dashed border-gray-300 bg-white p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-gray-500">
        <ShieldCheck size={22} />
      </span>
      {permissions.canReplyMessages ? (
        <>
          <p className="mt-3 text-base font-black text-gray-950">{t("urmall.biz.dash.canReplyTitle")}</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-gray-500">
            {t("urmall.biz.dash.canReplyDesc")}
          </p>
          <button
            type="button"
            onClick={onOpenMessages}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white"
          >
            <MessageSquare size={16} /> {t("urmall.biz.dash.openMessages")}
          </button>
        </>
      ) : permissions.canEditBusiness ? (
        <>
          <p className="mt-3 text-base font-black text-gray-950">Business information access</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-gray-500">
            You can update the store profile, contact details, location, categories, and opening hours.
          </p>
          <button
            type="button"
            onClick={onEditBusiness}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white"
          >
            <Store size={16} /> Edit business information
          </button>
        </>
      ) : permissions.canManagePlans ? (
        <>
          <p className="mt-3 text-base font-black text-gray-950">Plans & capacity access</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-gray-500">
            You can manage this store’s subscription and capacity.
          </p>
          <button
            type="button"
            onClick={onOpenPlans}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white"
          >
            Open plans
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 text-base font-black text-gray-950">{t("urmall.biz.dash.noRespTitle")}</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-gray-500">
            {t("urmall.biz.dash.noRespDesc")}
          </p>
        </>
      )}
    </div>
  );
}
