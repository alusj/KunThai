import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSellerOverview } from "../services/marketplace/sellerOverviewService";
import { MARKETPLACE_BUSINESS_CHANGED_EVENT } from "../services/marketplace/sellerRegistrationService";

const DEFAULT_OVERVIEW = {
  business: null,
  storeStatus: null,
  health: null,
  today: null,
};

const SELLER_OVERVIEW_MEMORY = {
  overview: null,
  savedAt: 0,
};

function normalizeOverview(overview) {
  return { ...DEFAULT_OVERVIEW, ...overview };
}

function hasOverviewData(overview) {
  return Boolean(overview?.business || overview?.storeStatus || overview?.health || overview?.today);
}

export function useSellerOverview({ enabled = true } = {}) {
  const [overview, setOverview] = useState(() => (enabled && SELLER_OVERVIEW_MEMORY.overview ? SELLER_OVERVIEW_MEMORY.overview : DEFAULT_OVERVIEW));
  const [loading, setLoading] = useState(() => enabled && !hasOverviewData(SELLER_OVERVIEW_MEMORY.overview));
  const [refreshing, setRefreshing] = useState(false);
  const overviewRef = useRef(overview);

  useEffect(() => {
    overviewRef.current = overview;
  }, [overview]);

  const loadOverview = useCallback(async (isActive = () => true) => {
    if (!enabled) {
      if (isActive()) {
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    const cachedOverview = SELLER_OVERVIEW_MEMORY.overview;
    const hasCachedOverview = hasOverviewData(cachedOverview) || hasOverviewData(overviewRef.current);

    if (cachedOverview && isActive()) {
      setOverview(cachedOverview);
    }

    if (hasCachedOverview) {
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    try {
      const nextOverview = normalizeOverview(await fetchSellerOverview());
      SELLER_OVERVIEW_MEMORY.overview = nextOverview;
      SELLER_OVERVIEW_MEMORY.savedAt = Date.now();
      if (isActive()) {
        setOverview(nextOverview);
      }
    } catch {
      if (isActive() && !hasCachedOverview) {
        setOverview(DEFAULT_OVERVIEW);
      }
    } finally {
      if (isActive()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    let active = true;

    if (!enabled) {
      if (!SELLER_OVERVIEW_MEMORY.overview) {
        setOverview(DEFAULT_OVERVIEW);
      }
      setLoading(false);
      setRefreshing(false);
      return () => {
        active = false;
      };
    }

    loadOverview(() => active);

    return () => {
      active = false;
    };
  }, [enabled, loadOverview]);

  useEffect(() => {
    if (!enabled) return undefined;

    function handleMessagesUpdated() {
      loadOverview(() => true);
    }

    function handleBusinessChanged() {
      SELLER_OVERVIEW_MEMORY.overview = null;
      SELLER_OVERVIEW_MEMORY.savedAt = 0;
      setOverview(DEFAULT_OVERVIEW);
      loadOverview(() => true);
    }

    window.addEventListener("marketplace-message-sent", handleMessagesUpdated);
    window.addEventListener("marketplace-seller-messages-updated", handleMessagesUpdated);
    window.addEventListener(MARKETPLACE_BUSINESS_CHANGED_EVENT, handleBusinessChanged);
    return () => {
      window.removeEventListener("marketplace-message-sent", handleMessagesUpdated);
      window.removeEventListener("marketplace-seller-messages-updated", handleMessagesUpdated);
      window.removeEventListener(MARKETPLACE_BUSINESS_CHANGED_EVENT, handleBusinessChanged);
    };
  }, [enabled, loadOverview]);

  return {
    ...overview,
    loading,
    isInitialLoading: loading && !hasOverviewData(overview),
    refreshing,
    isRefreshing: refreshing,
  };
}
