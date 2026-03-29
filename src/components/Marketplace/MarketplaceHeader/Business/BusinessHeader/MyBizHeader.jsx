import { useState } from "react";
import BackTab from "./BackTab";
import MyBizMenu from "./MyBizMenu/MyBizMenu";

export default function MyBizHeader({ onBack }) {
  /* =========================
     Menu open state
  ========================= */
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* =========================
          Header bar
      ========================= */}
      <header className="sticky top-0 z-30 bg-white border-b">
        <div className="flex items-center justify-between h-14 px-4">

          {/* Left: Back */}
          <BackTab onBack={onBack} />

          {/* Right: Menu button */}
          <button
            onClick={() => setMenuOpen(true)}
            className="text-2xl text-gray-700"
            aria-label="Open menu"
          >
            ☰
          </button>

        </div>
      </header>

      {/* =========================
          Drawer Menu
      ========================= */}
      <MyBizMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
    </>
  );
}
