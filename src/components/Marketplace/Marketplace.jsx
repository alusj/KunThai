import { useCallback, useEffect, useRef, useState } from "react";
import Browse from "./Browse/Browse";
import MarketplaceHeader from "./MarketplaceHeader/MarketplaceHeader";
import Business from "./MarketplaceHeader/Business/Business";
import Messages from "./Messages";
import Orders from "./Orders";
import ParentTabs from "./ParentTabs";
import AppBackTab from "../shared/AppBackTab";
import AppPortal from "../shared/AppPortal";

export default function Marketplace({ nav, setNav, onActivityChange }) {
  const [activeTab, setActiveTab] = useState("new");
  const [activeUtility, setActiveUtility] = useState(null);
  const [productMode, setProductMode] = useState(false);
  const [headerActivityOpen, setHeaderActivityOpen] = useState(false);
  const [businessClosing, setBusinessClosing] = useState(false);
  const businessCloseTimer = useRef(null);

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

  function openMyBiz() {
    if (businessCloseTimer.current) {
      window.clearTimeout(businessCloseTimer.current);
      businessCloseTimer.current = null;
    }

    setBusinessClosing(false);
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
    onActivityChange?.(Boolean(activeUtility) || headerActivityOpen || productMode || Boolean(nav.sub));
    return () => onActivityChange?.(false);
  }, [activeUtility, headerActivityOpen, nav.sub, onActivityChange, productMode]);

  if (nav.sub === "business") {
    return (
      <div className={`${businessClosing ? "kt-route-zoom-close" : "kt-route-zoom-open"} min-h-screen`}>
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
          />

          <ParentTabs
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setActiveTab(tab);
              setActiveUtility(null);
            }}
          />
        </>
      )}

      <div className={productMode ? "" : "px-4 pb-28 pt-4 sm:px-6 lg:px-8"}>
        <Browse activeTab={activeTab} onProductModeChange={setMarketplaceScreenMode} />
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
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
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
            <AppBackTab onBack={onClose} label={`Back to UrMall`} historyKey={`urmall-${title}`} useHistoryLayer={false} />
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
