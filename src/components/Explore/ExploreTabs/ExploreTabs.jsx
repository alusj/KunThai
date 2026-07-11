/*
  ExploreTabs (PARENT TABS)
  ------------------------
  Main navigation inside Explore.
  Strong visual weight.
*/

import { Sparkles, Users, Video } from "lucide-react";

const TABS = [
  { id: "UrFeed", label: "UrFeed", icon: Sparkles },
  { id: "Swip", label: "Swip", icon: Video },
  { id: "Connections", label: "Connections", icon: Users },
];

export default function ExploreTabs({ activeTab, setActiveTab, slideDirection = "forward" }) {
  const activeIndex = Math.max(0, TABS.findIndex((tab) => tab.id === activeTab));

  return (
    // bg-white/[0.52] (not /50) dodges the dark-mode compat layer's !important remap so the dark: variants can win.
    <div className="border-y border-white/70 bg-white/[0.52] px-2 py-2 shadow-sm backdrop-blur-2xl supports-[backdrop-filter]:bg-white/40 dark:border-slate-800/80 dark:bg-slate-950/70 dark:supports-[backdrop-filter]:bg-slate-950/60">
      <div
        className={`relative grid w-full grid-cols-3 gap-1 rounded-[24px] border border-white/80 bg-white/55 p-1 ring-1 ring-slate-950/5 dark:border-slate-700/60 dark:bg-slate-900/70 dark:ring-white/10 ${
          slideDirection === "backward" ? "kt-parent-tab-slide-backward" : "kt-parent-tab-slide-forward"
        }`}
      >
      <span
        className="pointer-events-none absolute bottom-1 top-1 rounded-[20px] bg-slate-950/90 shadow-md shadow-slate-950/15 transition-[left] duration-300 ease-out dark:bg-white dark:shadow-black/40"
        style={{
          left: `calc(0.25rem + ${activeIndex} * ((100% - 1rem) / 3 + 0.25rem))`,
          width: "calc((100% - 1rem) / 3)",
        }}
        aria-hidden="true"
      />
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`
              kt-touchable relative z-10 inline-flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-[18px] px-1.5 py-1.5 text-xs font-black transition sm:gap-2 sm:px-3 sm:text-[13px]
              ${
                isActive
                  ? "text-white dark:text-slate-950"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-950 dark:hover:bg-white/10 dark:hover:text-white"
              }
            `}
          >
            <Icon className="flex-none" size={15} strokeWidth={2.25} absoluteStrokeWidth />
            <span className="whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
      </div>
    </div>
  );
}
 
