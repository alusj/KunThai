import { useEffect, useState } from "react";

import { fetchSellerInsights } from "../services/marketplace/sellerInsightService";

const DEFAULT_INSIGHTS = {
  metrics: null,
  trafficSources: [],
  searchTerms: [],
  productSignals: null,
};

const SELLER_INSIGHTS_MEMORY = {
  loaded: false,
  insights: DEFAULT_INSIGHTS,
  savedAt: 0,
};

function normalizeInsights(insights) {
  return { ...DEFAULT_INSIGHTS, ...insights };
}

export function useSellerInsights() {
  const [insights, setInsights] = useState(() => SELLER_INSIGHTS_MEMORY.insights);
  const [loading, setLoading] = useState(() => !SELLER_INSIGHTS_MEMORY.loaded);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    const hasCachedInsights = SELLER_INSIGHTS_MEMORY.loaded;

    if (hasCachedInsights) {
      setInsights(SELLER_INSIGHTS_MEMORY.insights);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    fetchSellerInsights()
      .then((nextInsights) => {
        const normalizedInsights = normalizeInsights(nextInsights);
        SELLER_INSIGHTS_MEMORY.loaded = true;
        SELLER_INSIGHTS_MEMORY.insights = normalizedInsights;
        SELLER_INSIGHTS_MEMORY.savedAt = Date.now();
        if (active) {
          setInsights(normalizedInsights);
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

  return {
    ...insights,
    loading,
    isInitialLoading: loading && !SELLER_INSIGHTS_MEMORY.loaded,
    refreshing,
    isRefreshing: refreshing,
  };
}
