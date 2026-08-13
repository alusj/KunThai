import { useCallback, useEffect, useMemo, useState } from "react";

import {
  dismissSellerActivity,
  fetchSellerActivities,
} from "../services/marketplace/sellerActivityService";

const SELLER_ACTIVITIES_MEMORY = {
  loaded: false,
  activities: [],
  savedAt: 0,
};

export function useSellerActivities() {
  const [activities, setActivities] = useState(() => SELLER_ACTIVITIES_MEMORY.activities);
  const [loading, setLoading] = useState(() => !SELLER_ACTIVITIES_MEMORY.loaded);
  const [refreshing, setRefreshing] = useState(false);

  const loadActivities = useCallback((isActive = () => true, quiet = false) => {
    if (!quiet && !SELLER_ACTIVITIES_MEMORY.loaded) setLoading(true);
    return fetchSellerActivities()
      .then((nextActivities) => {
        SELLER_ACTIVITIES_MEMORY.loaded = true;
        SELLER_ACTIVITIES_MEMORY.activities = Array.isArray(nextActivities) ? nextActivities : [];
        SELLER_ACTIVITIES_MEMORY.savedAt = Date.now();
        if (isActive()) setActivities(SELLER_ACTIVITIES_MEMORY.activities);
      })
      .finally(() => {
        if (isActive()) {
          setLoading(false);
          setRefreshing(false);
        }
      });
  }, []);

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

    loadActivities(() => active).catch(() => {});

    const refresh = () => loadActivities(() => active, true).catch(() => {});
    window.addEventListener("marketplace-seller-notifications-updated", refresh);

    return () => {
      active = false;
      window.removeEventListener("marketplace-seller-notifications-updated", refresh);
    };
  }, [loadActivities]);

  function updateActivities(updater) {
    setActivities((current) => {
      const nextActivities = updater(current);
      SELLER_ACTIVITIES_MEMORY.loaded = true;
      SELLER_ACTIVITIES_MEMORY.activities = nextActivities;
      SELLER_ACTIVITIES_MEMORY.savedAt = Date.now();
      return nextActivities;
    });
  }

  function dismissActivity(activityId) {
    if (!activityId) return;
    updateActivities((current) => current.filter((activity) => activity.id !== activityId));
    dismissSellerActivity(activityId).catch(() => {});
  }

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
    dismissActivity,
    loading,
    isInitialLoading: loading && !SELLER_ACTIVITIES_MEMORY.loaded,
    refreshing,
    isRefreshing: refreshing,
  };
}
