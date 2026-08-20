import { useCallback, useEffect, useRef, useState } from "react";
import Browse from "./Browse/Browse";
import MarketplaceSearchOverlay from "./Browse/MarketplaceSearchOverlay";
import MarketplaceHeader from "./MarketplaceHeader/MarketplaceHeader";
import Business from "./MarketplaceHeader/Business/Business";
import Messages from "./Messages";
import Orders from "./Orders";
import ParentTabs from "./ParentTabs";
import MarketplaceParentNav from "./MarketplaceParentNav";
import VerticalMarketplace from "./VerticalMarketplace";
import AppBackTab from "../shared/AppBackTab";
import AppPortal from "../shared/AppPortal";
import useBodyScrollLock from "../shared/useBodyScrollLock";
import { useI18n } from "../../i18n";
import { useSellerHeader } from "../../Backend/hooks/useSellerHeader";
import { peekSellerOrdersAreaViewReturn } from "../../Backend/services/marketplace/navigationHandoffService";
import {
  fetchMarketplaceParentAvailability,
  MARKETPLACE_PARENT_TAB_MIN_ITEMS,
} from "../../Backend/services/marketplace/marketplaceVerticalService";
import {
  consumePendingMarketplaceScreen,
  OPEN_MARKETPLACE_SCREEN_EVENT,
} from "../../Backend/services/notificationBannerService";

const MARKETPLACE_TAB_ORDER = ["new", "discounted", "high-demand", "top-rated"];

// Auto-hide the header cluster on downward scroll (revealing more products) and
// bring it back on any upward scroll — the same feel as the Explore feed. Near
// the top of the page the header always stays visible.
function useAutoHideOnScroll(disabled) {
  const [hidden, setHidden] = useState(false);
  const lastYRef = useRef(0);

  useEffect(() => {
    if (disabled) {
      setHidden(false);
      return undefined;
    }

    lastYRef.current = window.scrollY || 0;
    let ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        const delta = y - lastYRef.current;
        if (y < 80) setHidden(false);
        else if (delta > 6) setHidden(true);
        else if (delta < -6) setHidden(false);
        lastYRef.current = y;
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [disabled]);

  return hidden;
}

export default function Marketplace({ nav, setNav, onActivityChange, onNotificationCountChange }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("new");
  const [activeParent, setActiveParent] = useState("all");
  const [dashboardPriority, setDashboardPriority] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [verticalDetailOpen, setVerticalDetailOpen] = useState(false);
  const [tabSlideDirection, setTabSlideDirection] = useState("forward");
  const [activeUtility, setActiveUtility] = useState(null);

  // Cross-service deep-link: a new-message banner tapped from another service
  // (e.g. UrRide) switches to UrMall and asks it to open Messages. Consume the
  // pending request on mount and also honor it live while already mounted.
  useEffect(() => {
    if (consumePendingMarketplaceScreen() === "messages") {
      setActiveUtility("messages");
    }
    function handleOpenMarketplaceScreen(event) {
      if (event.detail?.screen === "messages") {
        setActiveUtility("messages");
      }
    }
    window.addEventListener(OPEN_MARKETPLACE_SCREEN_EVENT, handleOpenMarketplaceScreen);
    return () => window.removeEventListener(OPEN_MARKETPLACE_SCREEN_EVENT, handleOpenMarketplaceScreen);
  }, []);
  const [productMode, setProductMode] = useState(false);
  const [headerActivityOpen, setHeaderActivityOpen] = useState(false);
  const [businessClosing, setBusinessClosing] = useState(false);
  const [buyerNotificationState, setBuyerNotificationState] = useState({
    orderCount: 0,
    messageCount: 0,
    totalCount: 0,
  });
  const [parentAvailability, setParentAvailability] = useState(null);
  const sellerHeader = useSellerHeader();
  // Search only has an inline surface on the retail feeds ("all"/"shop"); on the
  // vertical parents there is no discovery bar, so the header must stay put or
  // the shopper would have no way back.
  const searchSurfaceActive = activeParent === "all" || activeParent === "shop";
  const searchTakingOver = searchOpen && searchSurfaceActive;
  // The header retracts on scroll only while browsing; opening search or a
  // product screen keeps it out of the way in its own dedicated fashion.
  const headerHidden = useAutoHideOnScroll(productMode || searchTakingOver || Boolean(activeUtility) || Boolean(nav.sub));
  const sellerNotificationCount = sellerHeader.orderCount + sellerHeader.messageCount + sellerHeader.notificationCount;
  const totalNotificationCount = buyerNotificationState.totalCount + sellerNotificationCount;
  const businessCloseTimer = useRef(null);
  const headerStackRef = useRef(null);
  const [headerStackHeight, setHeaderStackHeight] = useState(0);
  // A vertical earns its own tab at MARKETPLACE_PARENT_TAB_MIN_ITEMS live items;
  // the whole row stays hidden (everything mixed under "All") until at least
  // two verticals qualify.
  const qualifiedParents = Object.entries(parentAvailability || {})
    .filter(([, count]) => Number(count || 0) >= MARKETPLACE_PARENT_TAB_MIN_ITEMS)
    .map(([id]) => id);
  const parentNavVisible = qualifiedParents.length >= 2;

  // Coming back from an order-address Area View: Marketplace remounts when
  // the page returns from transport, so a mount-time check reopens the
  // business workspace; the workspace itself consumes the flag and opens its
  // orders screen.
  useEffect(() => {
    if (!peekSellerOrdersAreaViewReturn()) return;
    setNav({ root: "marketplace", sub: "business" });
    // Runs only on mount: the flag is only ever set right before this
    // component unmounts for the Area View.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const headerStack = headerStackRef.current;
    if (!headerStack) {
      setHeaderStackHeight(0);
      return undefined;
    }

    const measure = () => setHeaderStackHeight(Math.ceil(headerStack.getBoundingClientRect().height));
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(headerStack);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [parentNavVisible, activeParent, productMode]);

  useEffect(() => {
    let alive = true;
    fetchMarketplaceParentAvailability()
      .then((counts) => {
        if (alive) setParentAvailability(counts);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (activeParent === "all") return;
    if (!parentNavVisible || !qualifiedParents.includes(activeParent)) {
      setActiveParent("all");
    }
    // qualifiedParents is derived from parentAvailability; activeParent guard keeps this stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeParent, parentNavVisible, parentAvailability]);

  useEffect(() => {
    onNotificationCountChange?.(totalNotificationCount);
  }, [onNotificationCountChange, totalNotificationCount]);

  const setMarketplaceScreenMode = useCallback((enabled) => {
    setProductMode(enabled);
    setNav((current) => {
      if (enabled) return { root: "marketplace", sub: "buyer-screen" };
      if (current.sub === "buyer-screen") return { root: "marketplace", sub: null };
      return current;
    });
  }, [setNav]);

  function openProductFromUtility(product) {
    setActiveUtility(null);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("marketplace-open-product", { detail: { product } }));
    }, 0);
  }

  function switchMarketplaceTab(tab) {
    if (!tab || tab === activeTab) return;
    const currentIndex = MARKETPLACE_TAB_ORDER.indexOf(activeTab);
    const nextIndex = MARKETPLACE_TAB_ORDER.indexOf(tab);
    setTabSlideDirection(nextIndex >= currentIndex ? "forward" : "backward");
    setActiveTab(tab);
  }

  // Search-overlay selections always resolve on the retail "all" surface (where
  // Browse is mounted and listens for these events). A short delay lets Browse
  // mount first when the shopper searched from a vertical parent.
  function dispatchToBrowse(name, detail) {
    setActiveParent("all");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(name, { detail })), 60);
  }

  function handleSearchOpenProduct(product) {
    dispatchToBrowse("marketplace-open-product", { product });
  }

  function handleSearchOpenSeller(seller) {
    dispatchToBrowse("marketplace-open-seller", { seller });
  }

  function handleSearchOpenVertical(type, item) {
    dispatchToBrowse("marketplace-open-vertical", { type, item });
  }

  function handleSearchApply(payload) {
    dispatchToBrowse("marketplace-apply-search", payload);
  }

  // Choosing a category in the search overlay reorders the "all" dashboard so
  // that category leads, with the other categories following — and closes the
  // overlay. "All categories" clears it back to the default order.
  function handleBrowseCategory(categoryId) {
    setActiveParent("all");
    setDashboardPriority(categoryId && categoryId !== "all" ? categoryId : null);
    setSearchOpen(false);
  }

  function openMyBiz() {
    if (businessCloseTimer.current) {
      window.clearTimeout(businessCloseTimer.current);
      businessCloseTimer.current = null;
    }

    setBusinessClosing(false);
    sellerHeader.markSellerSectionSeen("orders");
    sellerHeader.markSellerSectionSeen("messages");
    sellerHeader.markSellerSectionSeen("notifications");
    setNav({
      root: "marketplace",
      sub: "business",
    });
  }

  function closeMyBiz() {
    if (businessCloseTimer.current) {
      window.clearTimeout(businessCloseTimer.current);
    }

    setBusinessClosing(true);
    businessCloseTimer.current = window.setTimeout(() => {
      setNav({
        root: "marketplace",
        sub: null,
      });
      setBusinessClosing(false);
      businessCloseTimer.current = null;
    }, 240);
  }

  useEffect(() => {
    return () => {
      if (businessCloseTimer.current) {
        window.clearTimeout(businessCloseTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    onActivityChange?.(Boolean(activeUtility) || headerActivityOpen || productMode || verticalDetailOpen || Boolean(nav.sub));
    return () => onActivityChange?.(false);
  }, [activeUtility, headerActivityOpen, nav.sub, onActivityChange, productMode, verticalDetailOpen]);

  const { markSellerSectionSeen } = sellerHeader;
  useEffect(() => {
    if (nav.sub !== "business" || !sellerNotificationCount) return;
    // Depend on the stable callback, never on the sellerHeader object itself:
    // the hook returns a fresh object each render, and marking sections seen
    // triggers a re-render, so an object dep loops this effect infinitely.
    markSellerSectionSeen("orders");
    markSellerSectionSeen("messages");
    markSellerSectionSeen("notifications");
  }, [nav.sub, markSellerSectionSeen, sellerNotificationCount]);

  if (nav.sub === "business") {
    return (
      <div className={`${businessClosing ? "kt-explore-stack-leave-right" : "kt-explore-stack-enter"} kt-mobile-viewport`}>
        <Business
          onBack={closeMyBiz}
        />
      </div>
    );
  }

  return (
    <div
      className="w-full"
      style={{ "--urmall-sticky-header-height": `${headerHidden ? 0 : headerStackHeight}px` }}
    >
      {!productMode && (
        <div
          ref={headerStackRef}
          className={`sticky top-0 z-30 transition-transform duration-300 ease-out ${
            headerHidden ? "-translate-y-full" : "translate-y-0"
          }`}
        >
          <MarketplaceHeader
            activeUtility={activeUtility}
            onActivityChange={setHeaderActivityOpen}
            onSearchClick={() => setSearchOpen((current) => !current)}
            searchOpen={searchOpen}
            onMessagesClick={() => setActiveUtility((current) => (current === "messages" ? null : "messages"))}
            onOrdersClick={() => setActiveUtility("orders")}
            onMyBizClick={openMyBiz}
            onNotificationStateChange={setBuyerNotificationState}
            sellerNotificationCount={sellerNotificationCount}
          />
          {parentNavVisible ? (
            <MarketplaceParentNav
              active={activeParent}
              enabledParents={qualifiedParents}
              onChange={(parent) => {
                setActiveParent(parent);
                setActiveUtility(null);
                setVerticalDetailOpen(false);
              }}
            />
          ) : null}
          {activeParent === "all" || activeParent === "shop" ? (
            <ParentTabs
              activeTab={activeTab}
              setActiveTab={(tab) => {
                switchMarketplaceTab(tab);
                setActiveUtility(null);
              }}
            />
          ) : null}
        </div>
      )}

      <MarketplaceSearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenProduct={handleSearchOpenProduct}
        onOpenSeller={handleSearchOpenSeller}
        onOpenVertical={handleSearchOpenVertical}
        onApplySearch={handleSearchApply}
        activeCategory={dashboardPriority || "all"}
        onBrowseCategory={handleBrowseCategory}
      />

      <div
        key={`${activeParent}-${activeTab}`}
        className={`${productMode ? "" : "px-4 pb-28 pt-4 sm:px-6 lg:px-8"} ${
          tabSlideDirection === "backward" ? "kt-parent-tab-slide-backward" : "kt-parent-tab-slide-forward"
        }`}
      >
        {activeParent === "all" ? (
          <Browse
            activeTab={activeTab}
            searchOpen={false}
            onProductModeChange={setMarketplaceScreenMode}
            priorityCategory={dashboardPriority}
            onClearPriority={() => setDashboardPriority(null)}
            supplementalContent={<VerticalMarketplace mode="mixed" priorityType={dashboardPriority} onDetailChange={setVerticalDetailOpen} />}
          />
        ) : null}
        {activeParent === "shop" ? <Browse activeTab={activeTab} searchOpen={false} onProductModeChange={setMarketplaceScreenMode} /> : null}
        {activeParent === "food" ? <VerticalMarketplace mode="food" onDetailChange={setVerticalDetailOpen} /> : null}
        {activeParent === "hotels" ? <VerticalMarketplace mode="hotels" onDetailChange={setVerticalDetailOpen} /> : null}
        {activeParent === "property" ? <VerticalMarketplace mode="property" onDetailChange={setVerticalDetailOpen} /> : null}
      </div>

      <UtilityScreen
        open={activeUtility === "messages"}
        title={t("urmall.shell.messagesTitle")}
        subtitle={t("urmall.shell.messagesSubtitle")}
        onClose={() => setActiveUtility(null)}
        hideHeader
      >
        <Messages onBack={() => setActiveUtility(null)} onProductOpen={openProductFromUtility} />
      </UtilityScreen>

      <UtilityScreen
        open={activeUtility === "orders"}
        title={t("urmall.orders.title")}
        subtitle={t("urmall.orders.subtitle")}
        onClose={() => setActiveUtility(null)}
        hideHeader
      >
        <Orders onBack={() => setActiveUtility(null)} onProductOpen={openProductFromUtility} />
      </UtilityScreen>
    </div>
  );
}

function UtilityScreen({ children, hideHeader = false, open, onClose, subtitle, title }) {
  const { t } = useI18n();
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  return (
    <AppPortal>
      <aside
        aria-hidden={!open}
        inert={open ? undefined : "true"}
        className={`kt-urmall-screen-panel fixed inset-0 z-[1200] flex w-screen transform flex-col overflow-hidden bg-gray-50 shadow-2xl ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {!hideHeader ? (
          <header className="kt-header-glass flex h-16 items-center gap-3 px-3 sm:px-4">
            <AppBackTab onBack={onClose} label={t("urmall.shell.backToUrMall")} historyKey={`urmall-${title}`} />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-emerald-700">UrMall</p>
              <h2 className="truncate text-lg font-black text-gray-950">{title}</h2>
              {subtitle ? <p className="truncate text-xs font-bold text-gray-500">{subtitle}</p> : null}
            </div>
          </header>
        ) : null}
        <div className={`min-h-0 flex-1 ${hideHeader ? "overflow-hidden" : "overflow-y-auto"}`}>{children}</div>
      </aside>
    </AppPortal>
  );
}
