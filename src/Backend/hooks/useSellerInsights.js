import { useEffect, useState } from "react";

import { fetchSellerInsights } from "../services/marketplace/sellerInsightService";

const DEFAULT_INSIGHTS = {
  metrics: null,
  trafficSources: [],
  searchTerms: [],
  productSignals: null,
};

export function useSellerInsights() {
  const [insights, setInsights] = useState(DEFAULT_INSIGHTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetchSellerInsights()
      .then((nextInsights) => {
        if (active) {
          setInsights({ ...DEFAULT_INSIGHTS, ...nextInsights });
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

  return {
    ...insights,
    loading,
  };
}
