// src/explore/swip/Swip.jsx
import { useState } from "react";

// Category tabs
import SwipCategories from "./SwipCategories/SwipCategories";

// Content tabs
import All from "./tabs/All";
import Entertainment from "./tabs/Entertainment";
import Connections from "./tabs/Connections";
import Religious from "./tabs/Religious";
import Health from "./tabs/Health";
import Education from "./tabs/Education";

/*
  Swip.jsx
  --------
  TikTok-style vertical content
  - Horizontal scroll categories
  - Vertical scroll content
*/

export default function Swip() {
  const [tab, setTab] = useState("all");

  return (
    <div className="flex flex-col h-[calc(100vh-112px)] bg-slate-100">
      {/* =============================
          CATEGORY BAR (HORIZONTAL)
      ============================== */}
      <SwipCategories active={tab} setActive={setTab} />

      {/* =============================
          CONTENT AREA (VERTICAL)
      ============================== */}
      <div className="flex-1 overflow-y-auto">
        {tab === "all" && <All />}
        {tab === "entertainment" && <Entertainment />}
        {tab === "connections" && <Connections />}
        {tab === "religious" && <Religious />}
        {tab === "health" && <Health />}
        {tab === "education" && <Education />}
      </div>
    </div>
  );
}
