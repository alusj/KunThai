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
    <div className="border-b border-slate-200 bg-white">
      <div
        className={`relative grid w-full grid-cols-3 gap-1.5 px-2 py-3 sm:gap-2 sm:px-3 ${
          slideDirection === "backward" ? "kt-parent-tab-slide-backward" : "kt-parent-tab-slide-forward"
        }`}
      >
      <span
        className="pointer-events-none absolute bottom-3 top-3 rounded-full bg-slate-950 shadow-sm transition-[left] duration-300 ease-out"
        style={{
          left: `calc(0.5rem + ${activeIndex} * ((100% - 1.75rem) / 3 + 0.375rem))`,
          width: "calc((100% - 1.75rem) / 3)",
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
              kt-touchable relative z-10 inline-flex min-w-0 items-center justify-center gap-1 rounded-full px-1.5 py-2 text-[13px] font-black transition sm:gap-2 sm:px-3 sm:text-sm
              ${
                isActive
                  ? "text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }
            `}
          >
            <Icon className="flex-none" size={16} strokeWidth={2.25} absoluteStrokeWidth />
            <span className="whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
      </div>
    </div>
  );
}
 
