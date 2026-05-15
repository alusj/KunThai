import { useMemo, useState } from "react";

import { useExploreConnections } from "../../../../Backend/hooks/useExploreConnections";
import ConnectionsSummary from "./components/ConnectionsSummary";
import Discover from "./discover/Discover";
import MyCircle from "./myCircle/MyCircle";

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
      <ConnectionsSummary
        activeTab={tab}
        counts={counts}
        loading={loading && !circle.items.length && !followers.items.length && !discover.items.length}
        onSelect={setTab}
      />

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
