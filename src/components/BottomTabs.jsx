// web/src/components/BottomTabs.jsx

import { createElement, useEffect, useRef, useState } from "react";
import { Compass, ShoppingBag, Truck } from "lucide-react";

const tabs = [
  { id: "explore", label: "Explore", icon: Compass },
  { id: "marketplace", label: "UrMall", icon: ShoppingBag },
  { id: "transport", label: "UrRide", icon: Truck },
];

export default function BottomTabs({ badges = {}, page, setPage }) {
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
      className={`kt-pressable flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 rounded-[20px] px-1.5 py-1.5 text-[11px] font-black select-none ${
        page === id ? "text-white dark:text-slate-950" : "text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
      }`}
    >
      <span
        className={`grid h-7 w-7 place-items-center rounded-xl ${
          page === id ? "bg-white/10 dark:bg-slate-950/10" : "bg-white/[0.82] dark:bg-white/10"
        } relative`}
      >
        {createElement(icon, { size: 18, strokeWidth: 2.25, absoluteStrokeWidth: true })}
        {id !== page && Number(badges[id] || 0) > 0 ? (
          <span className="absolute -right-2 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white">
            {Number(badges[id]) > 9 ? "9+" : Number(badges[id])}
          </span>
        ) : null}
      </span>
      <span className="leading-tight">{label}</span>
    </button>
  );

  return (
    <nav
      className={`fixed inset-x-6 bg-transparent transition-transform duration-300 sm:inset-x-10 ${
        hidden ? "translate-y-[calc(100%+1.25rem)]" : "translate-y-0"
      }`}
      style={{ zIndex: 50, bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      aria-label="Main navigation"
    >
      <div className="relative mx-auto grid max-w-md grid-cols-3 gap-1 rounded-[26px] border border-white/80 bg-white/65 p-1 shadow-2xl shadow-slate-950/15 ring-1 ring-slate-950/10 backdrop-blur-2xl supports-[backdrop-filter]:bg-white/55 dark:border-slate-700/60 dark:bg-slate-900/85 dark:shadow-black/40 dark:ring-white/10 dark:supports-[backdrop-filter]:bg-slate-900/75">
        <span
          className="pointer-events-none absolute bottom-1 top-1 z-0 rounded-[22px] bg-slate-950/90 shadow-lg shadow-slate-950/20 transition-[left] duration-300 ease-out dark:bg-white dark:shadow-black/40"
          style={{
            left: `calc(0.25rem + ${activeIndex} * ((100% - 1rem) / 3 + 0.25rem))`,
            width: "calc((100% - 1rem) / 3)",
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
