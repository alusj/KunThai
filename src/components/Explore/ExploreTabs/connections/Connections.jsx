import { useMemo, useState } from "react";

import { useExploreConnections } from "../../../../Backend/hooks/useExploreConnections";
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
  const circle = useExploreConnections("mycircle", currentUserId);
  const followers = useExploreConnections("followers", currentUserId);
  const discover = useExploreConnections("discover", currentUserId);

  const counts = useMemo(
    () => ({
      circle: circle.items.length,
      followers: followers.items.length,
      discover: discover.items.length,
    }),
    [circle.items.length, discover.items.length, followers.items.length],
  );
  const loading = circle.loading || followers.loading || discover.loading;

  return (
    <div className="w-full space-y-4 px-4 pt-4 sm:px-5 lg:px-8">
      <ConnectionsSummary counts={counts} loading={loading && !circle.items.length && !followers.items.length && !discover.items.length} />

      <div className="rounded-[24px] border border-slate-200 bg-white px-2 pt-2 shadow-sm">
        <div className="flex w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((item) => (
            <TabButton key={item.id} active={tab === item.id} label={item.label} onClick={() => setTab(item.id)} />
          ))}
        </div>
      </div>

      <div className={tab === "mycircle" ? "block" : "hidden"} aria-hidden={tab !== "mycircle"}>
        <MyCircle connectionState={circle} onViewProfile={onViewProfile} />
      </div>
      <div className={tab === "followers" ? "block" : "hidden"} aria-hidden={tab !== "followers"}>
        <MyCircle connectionState={followers} kind="followers" onViewProfile={onViewProfile} />
      </div>
      <div className={tab === "discover" ? "block" : "hidden"} aria-hidden={tab !== "discover"}>
        <Discover connectionState={discover} onViewProfile={onViewProfile} />
      </div>
    </div>
  );
}
