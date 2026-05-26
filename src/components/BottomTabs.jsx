// web/src/components/BottomTabs.jsx

import { createElement, useEffect, useRef, useState } from "react";
import { Compass, ShoppingBag, Truck } from "lucide-react";

const tabs = [
  { id: "explore", label: "Explore", icon: Compass },
  { id: "marketplace", label: "UrMall", icon: ShoppingBag },
  { id: "transport", label: "Transport", icon: Truck },
];

export default function BottomTabs({ page, setPage }) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === page));

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
      className={`kt-pressable flex min-h-[58px] w-full flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-black select-none ${
        page === id ? "text-white" : "text-slate-500 hover:text-slate-950"
      }`}
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded-xl ${
          page === id ? "bg-white/10" : "bg-white/80"
        }`}
      >
        {createElement(icon, { size: 20, strokeWidth: 2.25, absoluteStrokeWidth: true })}
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
      <div className="relative mx-auto grid max-w-xl grid-cols-3 gap-1 rounded-[24px] border border-slate-200 bg-white/95 p-1.5 shadow-2xl shadow-slate-950/10 backdrop-blur-xl">
        <span
          className="pointer-events-none absolute bottom-1.5 top-1.5 z-0 rounded-[20px] bg-slate-950 shadow-lg shadow-slate-950/15 transition-[left] duration-300 ease-out"
          style={{
            left: `calc(0.375rem + ${activeIndex} * ((100% - 1.25rem) / 3 + 0.25rem))`,
            width: "calc((100% - 1.25rem) / 3)",
          }}
          aria-hidden="true"
        />
        {tabs.map((tab) => (
          <div key={tab.id} className="relative z-10 min-w-0">
            <Btn {...tab} />
          </div>
        ))}
      </div>
    </nav>
  );
}
