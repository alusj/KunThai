import { useCallback, useEffect, useState } from "react";
import { registerSellerMemory } from "./sellerMemoryRegistry";

import { fetchSellerPromotions } from "../services/marketplace/sellerPromotionService";

const DEFAULT_PROMOTIONS = {
  activePromotions: [],
  suggestedProducts: [],
  performance: null,
  opportunities: [],
};

const SELLER_PROMOTIONS_MEMORY = registerSellerMemory({
  loaded: false,
  promotions: DEFAULT_PROMOTIONS,
  savedAt: 0,
});

function normalizePromotions(promotions) {
  return { ...DEFAULT_PROMOTIONS, ...promotions };
}

export function useSellerPromotions() {
  const [promotions, setPromotions] = useState(() => SELLER_PROMOTIONS_MEMORY.promotions);
  const [loading, setLoading] = useState(() => !SELLER_PROMOTIONS_MEMORY.loaded);
  const [refreshing, setRefreshing] = useState(false);
  // Set only when nothing could be shown, so the screen offers a retry
  // instead of an endless skeleton.
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    const hasCachedPromotions = SELLER_PROMOTIONS_MEMORY.loaded;

    if (hasCachedPromotions) {
      setPromotions(SELLER_PROMOTIONS_MEMORY.promotions);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }
    setError(false);

    fetchSellerPromotions()
      .then((nextPromotions) => {
        const normalizedPromotions = normalizePromotions(nextPromotions);
        SELLER_PROMOTIONS_MEMORY.loaded = true;
        SELLER_PROMOTIONS_MEMORY.promotions = normalizedPromotions;
        SELLER_PROMOTIONS_MEMORY.savedAt = Date.now();
        if (active) {
          setPromotions(normalizedPromotions);
        }
      })
      .catch(() => {
        if (active && !SELLER_PROMOTIONS_MEMORY.loaded) setError(true);
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
    ...promotions,
    loading,
    isInitialLoading: loading && !SELLER_PROMOTIONS_MEMORY.loaded,
    refreshing,
    isRefreshing: refreshing,
    error,
    retry,
  };
}
