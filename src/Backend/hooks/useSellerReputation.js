import { useCallback, useEffect, useState } from "react";

import { fetchSellerReputation } from "../services/marketplace/sellerReputationService";
import { registerSellerMemory } from "./sellerMemoryRegistry";

const DEFAULT_REPUTATION = {
  metrics: null,
  badges: [],
  reviews: [],
};

const SELLER_REPUTATION_MEMORY = registerSellerMemory({
  loaded: false,
  reputation: DEFAULT_REPUTATION,
  savedAt: 0,
});

function normalizeReputation(reputation) {
  return { ...DEFAULT_REPUTATION, ...reputation };
}

export function useSellerReputation() {
  const [reputation, setReputation] = useState(() => SELLER_REPUTATION_MEMORY.reputation);
  const [loading, setLoading] = useState(() => !SELLER_REPUTATION_MEMORY.loaded);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  // Loads once per mount (and on Retry); a business switch empties the memory
  // and rebuilds the workspace, so the next mount loads the new business.
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
    setError("");

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
      .catch((loadError) => {
        if (active && !hasCachedReputation) setError(loadError?.message || "load failed");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  return {
    ...reputation,
    loading,
    isInitialLoading: loading && !SELLER_REPUTATION_MEMORY.loaded,
    refreshing,
    isRefreshing: refreshing,
    error,
    retry,
  };
}
