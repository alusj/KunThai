// src/explore/swip/Swip.jsx
import { useState } from "react";

// Category tabs
import SwipCategories from "./SwipCategories/SwipCategories";

import All from "./tabs/All";

/*
  Swip.jsx
  --------
  TikTok-style vertical content
  - Horizontal scroll categories
  - Vertical scroll content
*/

export default function Swip({ currentUserId = "", onViewProfile }) {
  const [tab, setTab] = useState("all");

  return (
    <div className="flex min-h-[calc(100vh-112px)] flex-col bg-transparent">
      {/* =============================
          CATEGORY BAR (HORIZONTAL)
      ============================== */}
      <SwipCategories active={tab} setActive={setTab} />

      {/* =============================
          CONTENT AREA (VERTICAL)
      ============================== */}
      <div className="flex-1">
        <All category={tab} currentUserId={currentUserId} onViewProfile={onViewProfile} />
      </div>
    </div>
  );
}
