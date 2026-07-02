import { useCallback, useEffect, useRef, useState } from "react";
import Browse from "./Browse/Browse";
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
import { useSellerHeader } from "../../Backend/hooks/useSellerHeader";
import { showToast } from "../../Backend/services/toastService";

const MARKETPLACE_TAB_ORDER = ["new", "discounted", "high-demand", "top-rated"];

export default function Marketplace({ active = false, nav, setNav, onActivityChange, onNotificationCountChange }) {
  const [activeTab, setActiveTab] = useState("new");
  const [activeParent, setActiveParent] = useState("all");
  const [verticalDetailOpen, setVerticalDetailOpen] = useState(false);
  const [tabSlideDirection, setTabSlideDirection] = useState("forward");
  const [activeUtility, setActiveUtility] = useState(null);
  const [productMode, setProductMode] = useState(false);
  const [headerActivityOpen, setHeaderActivityOpen] = useState(false);
  const [businessClosing, setBusinessClosing] = useState(false);
  const [buyerNotificationCount, setBuyerNotificationCount] = useState(0);
  const sellerHeader = useSellerHeader();
  const sellerNotificationCount = sellerHeader.orderCount + sellerHeader.messageCount + sellerHeader.notificationCount;
  const totalNotificationCount = buyerNotificationCount + sellerNotificationCount;
  const businessCloseTimer = useRef(null);
  const previousActiveRef = useRef(false);
  const previousBuyerUnreadRef = useRef(0);

  useEffect(() => {
    onNotificationCountChange?.(totalNotificationCount);
    const becameActive = active && !previousActiveRef.current;
    const receivedWhileActive = active && buyerNotificationCount > previousBuyerUnreadRef.current;
    previousActiveRef.current = active;
    previousBuyerUnreadRef.current = buyerNotificationCount;
    if (!buyerNotificationCount || (!becameActive && !receivedWhileActive)) return;
    showToast("Your UrMall activity has a new order or message update. Open the highlighted action to review it.", "info", { title: "UrMall update" });
  }, [active, buyerNotificationCount, onNotificationCountChange, totalNotificationCount]);

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

  useEffect(() => {
    if (nav.sub !== "business" || !sellerNotificationCount) return;
    sellerHeader.markSellerSectionSeen("orders");
    sellerHeader.markSellerSectionSeen("messages");
    sellerHeader.markSellerSectionSeen("notifications");
  }, [nav.sub, sellerHeader, sellerNotificationCount]);

  if (nav.sub === "business") {
    return (
      <div className={`${businessClosing ? "kt-explore-stack-leave-right" : "kt-explore-stack-enter"} min-h-screen`}>
        <Business
          onBack={closeMyBiz}
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      {!productMode && (
        <>
          <MarketplaceHeader
            activeUtility={activeUtility}
            onActivityChange={setHeaderActivityOpen}
            onOrdersClick={() => setActiveUtility((current) => (current === "orders" ? null : "orders"))}
            onMessagesClick={() => setActiveUtility((current) => (current === "messages" ? null : "messages"))}
            onMyBizClick={openMyBiz}
            onNotificationCountChange={setBuyerNotificationCount}
            sellerNotificationCount={sellerNotificationCount}
          />
          <MarketplaceParentNav
            active={activeParent}
            onChange={(parent) => {
              setActiveParent(parent);
              setActiveUtility(null);
              setVerticalDetailOpen(false);
            }}
          />
          {activeParent === "all" || activeParent === "shop" ? (
            <ParentTabs
              activeTab={activeTab}
              setActiveTab={(tab) => {
                switchMarketplaceTab(tab);
                setActiveUtility(null);
              }}
            />
          ) : null}
        </>
      )}

      <div
        key={`${activeParent}-${activeTab}`}
        className={`${productMode ? "" : "px-4 pb-28 pt-4 sm:px-6 lg:px-8"} ${
          tabSlideDirection === "backward" ? "kt-parent-tab-slide-backward" : "kt-parent-tab-slide-forward"
        }`}
      >
        {activeParent === "all" ? (
          <Browse
            activeTab={activeTab}
            onProductModeChange={setMarketplaceScreenMode}
            supplementalContent={<VerticalMarketplace mode="mixed" onDetailChange={setVerticalDetailOpen} />}
          />
        ) : null}
        {activeParent === "shop" ? <Browse activeTab={activeTab} onProductModeChange={setMarketplaceScreenMode} /> : null}
        {activeParent === "food" ? <VerticalMarketplace mode="food" onDetailChange={setVerticalDetailOpen} /> : null}
        {activeParent === "hotels" ? <VerticalMarketplace mode="hotels" onDetailChange={setVerticalDetailOpen} /> : null}
        {activeParent === "property" ? <VerticalMarketplace mode="property" onDetailChange={setVerticalDetailOpen} /> : null}
      </div>

      <UtilityScreen
        open={activeUtility === "orders"}
        title="Orders"
        subtitle="Your UrMall purchases and checkout requests"
        onClose={() => setActiveUtility(null)}
      >
        <Orders onBack={() => setActiveUtility(null)} onProductOpen={openProductFromUtility} compact />
      </UtilityScreen>

      <UtilityScreen
        open={activeUtility === "messages"}
        title="Messages"
        subtitle="Buyer conversations with UrMall sellers"
        onClose={() => setActiveUtility(null)}
        hideHeader
      >
        <Messages onBack={() => setActiveUtility(null)} onProductOpen={openProductFromUtility} />
      </UtilityScreen>
    </div>
  );
}

function UtilityScreen({ children, hideHeader = false, open, onClose, subtitle, title }) {
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
        className={`kt-urmall-screen-panel fixed inset-0 z-[1200] flex h-dvh w-screen transform flex-col overflow-hidden bg-gray-50 shadow-2xl ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {!hideHeader ? (
          <header className="kt-header-glass flex h-16 items-center gap-3 px-3 sm:px-4">
            <AppBackTab onBack={onClose} label={`Back to UrMall`} historyKey={`urmall-${title}`} />
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
