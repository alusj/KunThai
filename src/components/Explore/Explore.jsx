// src/Explore/Explore.jsx
import { useState } from "react";

// Pages (PARENT TAB CONTENT)
import UrFeed from "./ExploreTabs/urfeed/UrFeed";
import Swip from "./ExploreTabs/swip/Swip";
import Connections from "./ExploreTabs/connections/Connections"
import Notifications from "./ExploreTabs/notification/Notifications";

// UI Components
import ExploreHeader from "./components/header/ExploreHeader";
import ExploreTabs from "./ExploreTabs/ExploreTabs";

/*
  Explore.jsx
  -----------
  Root container for the Explore section.

  Responsibilities:
  - Renders the header
  - Controls parent tab state
  - Decides which page to show
*/

export default function Explore() {
  // Parent tab state
  const [activeTab, setActiveTab] = useState("UrFeed");

  return (
    <div className="w-full min-h-screen bg-slate-100">

      {/* =========================
          HEADER (always visible)
      ========================= */}
      <ExploreHeader />

      {/* =========================
          PARENT TABS
      ========================= */}
      <ExploreTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* =========================
          ACTIVE PAGE
      ========================= */}
      <div className="pt-2">
        {activeTab === "UrFeed" && <UrFeed />}
        {activeTab === "Swip" && <Swip />}
        {activeTab === "Connections" && <Connections />}
        {activeTab === "Notifications" && <Notifications />}
      </div>

    </div>
  );
}
