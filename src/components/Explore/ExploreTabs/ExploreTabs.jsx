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
    <div className="border-y border-white/70 bg-white/50 px-2 py-2 shadow-sm backdrop-blur-2xl supports-[backdrop-filter]:bg-white/40">
      <div
        className={`relative grid w-full grid-cols-3 gap-1 rounded-[24px] border border-white/80 bg-white/55 p-1 ring-1 ring-slate-950/5 ${
          slideDirection === "backward" ? "kt-parent-tab-slide-backward" : "kt-parent-tab-slide-forward"
        }`}
      >
      <span
        className="pointer-events-none absolute bottom-1 top-1 rounded-[20px] bg-slate-950/90 shadow-md shadow-slate-950/15 transition-[left] duration-300 ease-out"
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
                  ? "text-white"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
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
 
