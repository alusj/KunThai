// web/src/components/BottomTabs.jsx

import { createElement, useEffect, useRef, useState } from "react";
import { FiCompass, FiShoppingBag, FiTruck } from "react-icons/fi";

const tabs = [
  { id: "explore", label: "Explore", icon: FiCompass },
  { id: "marketplace", label: "UrMall", icon: FiShoppingBag },
  { id: "transport", label: "Transport", icon: FiTruck },
];

export default function BottomTabs({ page, setPage }) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      if (y > lastY.current + 8) setHidden(true);
      else if (y < lastY.current - 8) setHidden(false);
      lastY.current = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const Btn = ({ id, label, icon }) => (
    <button
      type="button"
      onClick={() => setPage(id)}
      aria-current={page === id ? "page" : undefined}
      className={`kt-touchable flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-black select-none ${
        page === id ? "bg-slate-950 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded-xl ${
          page === id ? "bg-white/10" : "bg-white"
        }`}
      >
        {createElement(icon, { size: 20 })}
      </span>
      <span className="leading-tight">{label}</span>
    </button>
  );

  return (
    <nav
      className={`fixed inset-x-3 bg-transparent transition-transform duration-300 sm:inset-x-6 ${
        hidden ? "translate-y-[calc(100%+1.25rem)]" : "translate-y-0"
      }`}
      style={{ zIndex: 50, bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      aria-label="Main navigation"
    >
      <div className="mx-auto grid max-w-xl grid-cols-3 gap-1 rounded-[24px] border border-slate-200 bg-white/95 p-1.5 shadow-2xl shadow-slate-950/10 backdrop-blur-xl">
        {tabs.map((tab) => (
          <Btn key={tab.id} {...tab} />
        ))}
      </div>
    </nav>
  );
}
