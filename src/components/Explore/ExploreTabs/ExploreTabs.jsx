/*
  ExploreTabs (PARENT TABS)
  ------------------------
  Main navigation inside Explore.
  Strong visual weight.
*/

import { HiOutlineSparkles, HiOutlineUserGroup, HiOutlineVideoCamera } from "react-icons/hi2";

const TABS = [
  { id: "UrFeed", label: "UrFeed", icon: HiOutlineSparkles },
  { id: "Swip", label: "Swip", icon: HiOutlineVideoCamera },
  { id: "Connections", label: "Connections", icon: HiOutlineUserGroup },
];

export default function ExploreTabs({ activeTab, setActiveTab }) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="grid w-full grid-cols-3 gap-1.5 px-2 py-3 sm:gap-2 sm:px-3">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              inline-flex min-w-0 items-center justify-center gap-1 rounded-full px-1.5 py-2 text-[13px] font-black transition sm:gap-2 sm:px-3 sm:text-sm
              ${
                isActive
                  ? "bg-slate-950 text-white shadow"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }
            `}
          >
            <Icon className="flex-none text-sm sm:text-base" />
            <span className="whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
      </div>
    </div>
  );
}
 
