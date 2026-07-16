import { useCallback, useEffect, useState } from "react";

import {
  createMarketplaceProductPromotion,
  fetchSellerPromotions,
} from "../services/marketplace/sellerPromotionService";

const DEFAULT_PROMOTIONS = {
  wallet: null,
  activePromotions: [],
  pendingTasks: [],
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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadPromotions = useCallback(async ({ initial = false } = {}) => {
    const hasCachedPromotions = SELLER_PROMOTIONS_MEMORY.loaded;

    if (hasCachedPromotions) {
      setPromotions(SELLER_PROMOTIONS_MEMORY.promotions);
      setLoading(false);
      setRefreshing(!initial);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    const nextPromotions = normalizePromotions(await fetchSellerPromotions());
    SELLER_PROMOTIONS_MEMORY.loaded = true;
    SELLER_PROMOTIONS_MEMORY.promotions = nextPromotions;
    SELLER_PROMOTIONS_MEMORY.savedAt = Date.now();
    setPromotions(nextPromotions);
    setLoading(false);
    setRefreshing(false);
    return nextPromotions;
  }, []);

  useEffect(() => {
    let active = true;

    loadPromotions({ initial: true })
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
  }, [loadPromotions]);

  async function createPromotion(product, options) {
    setCreateError("");
    setCreating(true);
    try {
      const result = await createMarketplaceProductPromotion(product, options);
      await loadPromotions();
      return result;
    } catch (error) {
      setCreateError(error.message || "Unable to create promotion.");
      throw error;
    } finally {
      setCreating(false);
    }
  }

  return {
    ...promotions,
    loading,
    isInitialLoading: loading && !SELLER_PROMOTIONS_MEMORY.loaded,
    refreshing,
    isRefreshing: refreshing,
    creating,
    createError,
    createPromotion,
    refresh: () => loadPromotions(),
  };
}
