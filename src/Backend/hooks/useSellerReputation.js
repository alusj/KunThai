import { useEffect, useState } from "react";

import { fetchSellerReputation } from "../services/marketplace/sellerReputationService";

const DEFAULT_REPUTATION = {
  metrics: null,
  badges: [],
  reviewsNeedingResponse: [],
  recentReviews: [],
};

const SELLER_REPUTATION_MEMORY = {
  loaded: false,
  reputation: DEFAULT_REPUTATION,
  savedAt: 0,
};

function normalizeReputation(reputation) {
  return { ...DEFAULT_REPUTATION, ...reputation };
}

export function useSellerReputation() {
  const [reputation, setReputation] = useState(() => SELLER_REPUTATION_MEMORY.reputation);
  const [loading, setLoading] = useState(() => !SELLER_REPUTATION_MEMORY.loaded);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    const hasCachedReputation = SELLER_REPUTATION_MEMORY.loaded;

    if (hasCachedReputation) {
      setReputation(SELLER_REPUTATION_MEMORY.reputation);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    fetchSellerReputation()
      .then((nextReputation) => {
        const normalizedReputation = normalizeReputation(nextReputation);
        SELLER_REPUTATION_MEMORY.loaded = true;
        SELLER_REPUTATION_MEMORY.reputation = normalizedReputation;
        SELLER_REPUTATION_MEMORY.savedAt = Date.now();
        if (active) {
          setReputation(normalizedReputation);
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
    ...reputation,
    loading,
    isInitialLoading: loading && !SELLER_REPUTATION_MEMORY.loaded,
    refreshing,
    isRefreshing: refreshing,
  };
}
