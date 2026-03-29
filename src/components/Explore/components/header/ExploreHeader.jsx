// =====================================
// src/Explore/components/header/ExploreHeader.jsx
// Main header for Explore screen
// =====================================

import { useState } from "react";

// Stand-alone header components
import MenuButton from "./MenuButton";
import MessageButton from "./MessageButton";
import SearchButton from "./SearchButton";
import CreateButton from "./CreateButton";
import ProfileButton from "./ProfileButton";

// Drawer menu
import HeaderMenu from "./HeaderMenu";

/*
  ExploreHeader
  -------------
  Layout:
  - LEFT: Menu + Messages
  - CENTER: Search
  - RIGHT: Create + Profile

  Notes:
  - Messages is NOT a parent tab
  - Each header action is isolated for future redesign
*/

export default function ExploreHeader() {
  // Controls slide-out menu visibility
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* ================= HEADER ================= */}
      <header className="sticky top-0 z-30 bg-white border-b">
        <div className="h-[56px] flex items-center justify-between px-4">

          {/* LEFT: Menu + Messages */}
          <div className="flex items-center gap-4">
            <MenuButton onClick={() => setMenuOpen(true)} />
            <MessageButton />
          </div>


          {/* RIGHT: Create + Profile */}
          <div className="flex items-center gap-4">
            <SearchButton />
            <CreateButton />
            <ProfileButton />
          </div>
        </div>
      </header>

      {/* ============ SLIDE-OUT MENU ============ */}
      <HeaderMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
