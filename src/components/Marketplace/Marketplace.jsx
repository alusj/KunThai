import { useState } from "react";

/* =========================
   Header (MyBiz, Cart, Menu)
========================= */
import MarketplaceHeader from "./MarketplaceHeader/MarketplaceHeader";

/* =========================
   Buyer Parent Tabs
========================= */
import ParentTabs from "./ParentTabs";

/* =========================
   Buyer Screens
========================= */
import Browse from "./Browse/Browse";
import Orders from "./Orders";
import Messages from "./Messages";

/* =========================
   Seller Full-Screen
========================= */
import Business from "./MarketplaceHeader/Business/Business";

export default function Marketplace({ nav, setNav }) {
  /**
   * Buyer tab state
   * (LOCAL to Marketplace – this is fine)
   */
  const [activeTab, setActiveTab] = useState("browse");

  /* =========================
     FULL-SCREEN BUSINESS VIEW
     - No header
     - No parent tabs
     - Bottom tabs hidden by App.jsx
  ========================= */
  if (nav.sub === "business") {
    return (
      <Business
        onBack={() =>
          setNav({
            root: "marketplace",
            sub: null,
          })
        }
      />
    );
  }

  /* =========================
     NORMAL MARKETPLACE VIEW
  ========================= */
  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <MarketplaceHeader
        onMyBizClick={() =>
          setNav({
            root: "marketplace",
            sub: "business",
          })
        }
      />

      {/* Buyer Parent Tabs */}
      <ParentTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Buyer Content Area */}
      <div className="px-4 pt-4 pb-28">
        {activeTab === "browse" && <Browse />}
        {activeTab === "orders" && <Orders />}
        {activeTab === "messages" && <Messages />}
      </div>
    </div>
  );
}
