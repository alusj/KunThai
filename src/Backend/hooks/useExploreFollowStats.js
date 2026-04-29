import { useEffect, useState } from "react";

import { fetchExploreFollowStats } from "../services/exploreService";

export function useExploreFollowStats(userId) {
  const [stats, setStats] = useState({ followers: 0, following: 0 });

  useEffect(() => {
    let active = true;

    fetchExploreFollowStats(userId)
      .then((nextStats) => {
        if (active) setStats(nextStats);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [userId]);

  return stats;
}
