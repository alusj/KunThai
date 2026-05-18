import { useCallback, useEffect, useState } from "react";
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

  useEffect(() => {
    onActivityChange?.(Boolean(activeUtility) || headerActivityOpen || productMode || Boolean(nav.sub));
    return () => onActivityChange?.(false);
  }, [activeUtility, headerActivityOpen, nav.sub, onActivityChange, productMode]);

  if (nav.sub === "business") {
    return (
      <div className="kt-route-transition min-h-screen">
        <Business
          onBack={() =>
            setNav({
              root: "marketplace",
              sub: null,
            })
          }
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
            onMyBizClick={() =>
              setNav({
                root: "marketplace",
                sub: "business",
              })
            }
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

      <UtilityDrawer
        open={activeUtility === "orders"}
        title="Orders"
        subtitle="Your UrMall purchases and checkout requests"
        onClose={() => setActiveUtility(null)}
      >
        <Orders onBack={() => setActiveUtility(null)} onProductOpen={openProductFromUtility} compact />
      </UtilityDrawer>

      <UtilityDrawer
        open={activeUtility === "messages"}
        title="Messages"
        subtitle="Buyer conversations with UrMall sellers"
        onClose={() => setActiveUtility(null)}
      >
        <Messages onBack={() => setActiveUtility(null)} onProductOpen={openProductFromUtility} compact />
      </UtilityDrawer>
    </div>
  );
}

function UtilityDrawer({ children, open, onClose, subtitle, title }) {
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  return (
    <AppPortal>
      {open ? <button type="button" aria-label={`Close ${title}`} onClick={onClose} className="kt-backdrop fixed inset-0 z-[1190]" /> : null}
      <aside
        className={`fixed right-0 top-0 z-[1200] flex h-full w-full max-w-3xl transform flex-col overflow-hidden bg-gray-50 shadow-2xl transition-transform duration-300 ${
          open ? "kt-panel-enter translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="kt-header-glass flex h-16 items-center gap-3 px-3 sm:px-4">
          <AppBackTab onBack={onClose} label={`Back to UrMall`} historyKey={`urmall-${title}`} useHistoryLayer={false} />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-emerald-700">UrMall</p>
            <h2 className="truncate text-lg font-black text-gray-950">{title}</h2>
            {subtitle ? <p className="truncate text-xs font-bold text-gray-500">{subtitle}</p> : null}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </AppPortal>
  );
}
