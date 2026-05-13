import { useMemo, useState } from "react";

import { useExploreFollowStats } from "../../../../Backend/hooks/useExploreFollowStats";
import ConnectionsSummary from "./components/ConnectionsSummary";
import Discover from "./discover/Discover";
import MyCircle from "./myCircle/MyCircle";

const TABS = [
  { id: "mycircle", label: "My Circle" },
  { id: "followers", label: "Followers" },
  { id: "discover", label: "Discover" },
];

function TabButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-1 px-4 pb-4 pt-3 text-base font-black transition ${
        active
          ? "text-sky-700 after:absolute after:bottom-0 after:left-6 after:right-6 after:h-0.5 after:rounded-full after:bg-sky-700"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );
}

export default function Connections({ currentUserId = "", onViewProfile }) {
  const [tab, setTab] = useState("mycircle");
  const stats = useExploreFollowStats(currentUserId);
  const statValues = stats.stats || {};

  const counts = useMemo(
    () => ({
      following: statValues.following,
      followers: statValues.followers,
      discover: statValues.suggested,
    }),
    [statValues.followers, statValues.following, statValues.suggested],
  );

  return (
    <div className="w-full space-y-4 px-4 pt-4 sm:px-5 lg:px-8">
      <ConnectionsSummary counts={counts} loading={stats.loading} />

      <div className="rounded-[24px] border border-slate-200 bg-white px-2 pt-2 shadow-sm">
        <div className="flex w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((item) => (
            <TabButton key={item.id} active={tab === item.id} label={item.label} onClick={() => setTab(item.id)} />
          ))}
        </div>
      </div>

      <div className={tab === "mycircle" ? "block" : "hidden"} aria-hidden={tab !== "mycircle"}>
        <MyCircle currentUserId={currentUserId} onViewProfile={onViewProfile} />
      </div>
      <div className={tab === "followers" ? "block" : "hidden"} aria-hidden={tab !== "followers"}>
        <MyCircle currentUserId={currentUserId} kind="followers" onViewProfile={onViewProfile} />
      </div>
      <div className={tab === "discover" ? "block" : "hidden"} aria-hidden={tab !== "discover"}>
        <Discover currentUserId={currentUserId} onViewProfile={onViewProfile} />
      </div>
    </div>
  );
}
