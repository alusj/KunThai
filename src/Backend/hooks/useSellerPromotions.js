import { useEffect, useState } from "react";

import { fetchSellerPromotions } from "../services/marketplace/sellerPromotionService";

const DEFAULT_PROMOTIONS = {
  activePromotions: [],
  suggestedProducts: [],
  performance: null,
  opportunities: [],
};

const SELLER_PROMOTIONS_MEMORY = {
  loaded: false,
  promotions: DEFAULT_PROMOTIONS,
  savedAt: 0,
};

function normalizePromotions(promotions) {
  return { ...DEFAULT_PROMOTIONS, ...promotions };
}

export function useSellerPromotions() {
  const [promotions, setPromotions] = useState(() => SELLER_PROMOTIONS_MEMORY.promotions);
  const [loading, setLoading] = useState(() => !SELLER_PROMOTIONS_MEMORY.loaded);
  const [refreshing, setRefreshing] = useState(false);

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
    ...promotions,
    loading,
    isInitialLoading: loading && !SELLER_PROMOTIONS_MEMORY.loaded,
    refreshing,
    isRefreshing: refreshing,
  };
}
