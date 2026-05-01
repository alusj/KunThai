import { useEffect, useMemo, useState } from "react";

import { fetchSellerActivities } from "../services/marketplace/sellerActivityService";

export function useSellerActivities() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetchSellerActivities()
      .then((nextActivities) => {
        if (active) {
          setActivities(nextActivities);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
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
  };
}
