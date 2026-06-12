import { useEffect, useMemo, useState } from "react";

import { fetchSellerActivities } from "../services/marketplace/sellerActivityService";

const SELLER_ACTIVITIES_MEMORY = {
  loaded: false,
  activities: [],
  savedAt: 0,
};

export function useSellerActivities() {
  const [activities, setActivities] = useState(() => SELLER_ACTIVITIES_MEMORY.activities);
  const [loading, setLoading] = useState(() => !SELLER_ACTIVITIES_MEMORY.loaded);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    const hasCachedActivities = SELLER_ACTIVITIES_MEMORY.loaded;

    if (hasCachedActivities) {
      setActivities(SELLER_ACTIVITIES_MEMORY.activities);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    fetchSellerActivities()
      .then((nextActivities) => {
        SELLER_ACTIVITIES_MEMORY.loaded = true;
        SELLER_ACTIVITIES_MEMORY.activities = Array.isArray(nextActivities) ? nextActivities : [];
        SELLER_ACTIVITIES_MEMORY.savedAt = Date.now();
        if (active) {
          setActivities(SELLER_ACTIVITIES_MEMORY.activities);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(
    () => ({
      total: activities.length,
      needsAction: activities.filter((activity) => activity.actionLabel).length,
      warnings: activities.filter((activity) => activity.status === "warning").length,
    }),
    [activities],
  );

  return {
    activities,
    summary,
    loading,
    isInitialLoading: loading && !SELLER_ACTIVITIES_MEMORY.loaded,
    refreshing,
    isRefreshing: refreshing,
  };
}
