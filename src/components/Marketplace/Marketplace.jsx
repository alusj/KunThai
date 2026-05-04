import { useState } from "react";
import Browse from "./Browse/Browse";
import MarketplaceHeader from "./MarketplaceHeader/MarketplaceHeader";
import Business from "./MarketplaceHeader/Business/Business";
import Messages from "./Messages";
import Orders from "./Orders";
import ParentTabs from "./ParentTabs";

export default function Marketplace({ nav, setNav }) {
  const [activeTab, setActiveTab] = useState("new");
  const [activeUtility, setActiveUtility] = useState(null);

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

  if (activeUtility === "orders") {
    return <Orders onBack={() => setActiveUtility(null)} />;
  }

  if (activeUtility === "messages") {
    return <Messages onBack={() => setActiveUtility(null)} />;
  }

  return (
    <div className="w-full">
      <MarketplaceHeader
        activeUtility={activeUtility}
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

      <div className="px-4 pb-28 pt-4 sm:px-6 lg:px-8">
        <Browse activeTab={activeTab} />
      </div>
    </div>
  );
}
