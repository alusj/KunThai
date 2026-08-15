// web/src/components/BottomTabs.jsx

import { createElement, useEffect, useRef, useState } from "react";
import { Compass, ShoppingBag, Truck } from "lucide-react";

import { useI18n } from "../i18n";

const tabs = [
  { id: "explore", label: "Explore", icon: Compass },
  { id: "marketplace", label: "UrMall", icon: ShoppingBag },
  { id: "transport", label: "UrRide", icon: Truck },
];

export default function BottomTabs({ badges = {}, page, setPage }) {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(false);
  const scrollPositions = useRef(new WeakMap());
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === page));

  useEffect(() => {
    const onScroll = (event) => {
      const target = event.target === document ? document.scrollingElement : event.target;
      const scrollTarget = target instanceof Element ? target : document.scrollingElement;
      if (!scrollTarget) return;

      const y = Number(scrollTarget.scrollTop || window.scrollY || 0);
      const previous = Number(scrollPositions.current.get(scrollTarget) || 0);
      if (y <= 8 || y < previous - 8) setHidden(false);
      else if (y > previous + 8) setHidden(true);
      scrollPositions.current.set(scrollTarget, y);
    };

    // Most KunThai screens scroll inside a bounded panel rather than `window`.
    // Scroll does not bubble, so capture it at document level to keep the main
    // navigation behaviour consistent across all three services.
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  useEffect(() => {
    setHidden(false);
  }, [page]);

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
        {Number(badges[id] || 0) > 0 ? (
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
      className="fixed inset-x-6 bg-transparent transition-[transform,opacity,visibility] duration-300 sm:inset-x-10"
      style={{
        zIndex: 50,
        bottom: "max(0.75rem, var(--kt-safe-area-bottom))",
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
        transform: hidden
          ? "translate3d(0, calc(100% + var(--kt-safe-area-bottom) + 2rem), 0)"
          : "translate3d(0, 0, 0)",
        visibility: hidden ? "hidden" : "visible",
      }}
      aria-hidden={hidden}
      aria-label={t("nav.mainNavigation")}
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
