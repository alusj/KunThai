// src/components/Marketplace/Browse/Browse.jsx

import { useState } from "react";

/* =========================
   Child tabs navigation
========================= */
import BrowseTabs from "./BrowseTabs";

/* =========================
   Child tab screens
========================= */
import New from "./tabs/New";
import Discounted from "./tabs/Discounted";
import HighDemand from "./tabs/HighDemand";
import TopRated from "./tabs/TopRated";

export default function Browse() {
  /* =========================
     Browse-only tab state
  ========================= */
  const [activeTab, setActiveTab] = useState("new");

  return (
    <div className="space-y-4">

      {/* =========================
          Browse child tabs
      ========================= */}
      <BrowseTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* =========================
          Browse content
      ========================= */}
      {activeTab === "new" && <New />}
      {activeTab === "discounted" && <Discounted />}
      {activeTab === "high-demand" && <HighDemand />}
      {activeTab === "top-rated" && <TopRated />}

    </div>
  );
}
