import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSellerOverview } from "../services/marketplace/sellerOverviewService";
import {
  MARKETPLACE_BUSINESS_CHANGED_EVENT,
  readCachedActiveRegisteredBusinessId,
} from "../services/marketplace/sellerRegistrationService";

const DEFAULT_OVERVIEW = {
  business: null,
  storeStatus: null,
  health: null,
  today: null,
  verticalWorkspace: null,
};

const SELLER_OVERVIEW_MEMORY = {
  overview: null,
  savedAt: 0,
  byBusiness: new Map(),
};
const OVERVIEW_STORAGE_KEY = "kunthai.sellerOverview";
const MAX_CACHED_BUSINESSES = 8;

// Rehydrate the last seller overview across reloads so the dashboard opens with
// real numbers instead of a skeleton or zeroed stats; a silent refresh follows.
if (typeof localStorage !== "undefined" && !SELLER_OVERVIEW_MEMORY.overview) {
  try {
    const stored = JSON.parse(localStorage.getItem(OVERVIEW_STORAGE_KEY) || "null");
    const entries = Array.isArray(stored?.entries)
      ? stored.entries
      : stored?.overview?.business?.id
        ? [{ businessId: stored.overview.business.id, overview: stored.overview, savedAt: stored.savedAt }]
        : [];
    entries.forEach((entry) => {
      if (!entry?.businessId || !entry?.overview?.business) return;
      SELLER_OVERVIEW_MEMORY.byBusiness.set(entry.businessId, {
        overview: entry.overview,
        savedAt: Number(entry.savedAt || 0),
      });
    });
    const activeBusinessId = readCachedActiveRegisteredBusinessId();
    const preferred = activeBusinessId
      ? SELLER_OVERVIEW_MEMORY.byBusiness.get(activeBusinessId)
      : [...SELLER_OVERVIEW_MEMORY.byBusiness.values()].sort((a, b) => b.savedAt - a.savedAt)[0];
    if (preferred) {
      SELLER_OVERVIEW_MEMORY.overview = preferred.overview;
      SELLER_OVERVIEW_MEMORY.savedAt = preferred.savedAt;
    }
  } catch {
    // Stored overview is an optimization only.
  }
}

function persistOverviewCache() {
  try {
    const entries = [...SELLER_OVERVIEW_MEMORY.byBusiness.entries()]
      .map(([businessId, entry]) => ({ businessId, ...entry }))
      .sort((first, second) => second.savedAt - first.savedAt)
      .slice(0, MAX_CACHED_BUSINESSES);
    localStorage.setItem(
      OVERVIEW_STORAGE_KEY,
      JSON.stringify({ entries }),
    );
  } catch {
    // Storage may be unavailable; the in-memory cache still applies.
  }
}

function activateOverviewCache(businessId) {
  const entry = businessId ? SELLER_OVERVIEW_MEMORY.byBusiness.get(businessId) : null;
  SELLER_OVERVIEW_MEMORY.overview = entry?.overview || null;
  SELLER_OVERVIEW_MEMORY.savedAt = Number(entry?.savedAt || 0);
  return entry?.overview || null;
}

function rememberOverview(overview) {
  const businessId = overview?.business?.id;
  if (!businessId) return;
  const savedAt = Date.now();
  SELLER_OVERVIEW_MEMORY.overview = overview;
  SELLER_OVERVIEW_MEMORY.savedAt = savedAt;
  SELLER_OVERVIEW_MEMORY.byBusiness.set(businessId, { overview, savedAt });
  persistOverviewCache();
}

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

    const targetBusinessId = readCachedActiveRegisteredBusinessId();
    const cachedOverview = targetBusinessId
      ? SELLER_OVERVIEW_MEMORY.byBusiness.get(targetBusinessId)?.overview || null
      : SELLER_OVERVIEW_MEMORY.overview;
    const currentOverview = overviewRef.current?.business?.id === targetBusinessId
      ? overviewRef.current
      : null;
    const hasCachedOverview = hasOverviewData(cachedOverview) || hasOverviewData(currentOverview);

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
      rememberOverview(nextOverview);
      const latestTargetId = readCachedActiveRegisteredBusinessId();
      if (isActive() && (!latestTargetId || nextOverview.business?.id === latestTargetId)) {
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

    function handleBusinessChanged(event) {
      const businessId = event.detail?.businessId || readCachedActiveRegisteredBusinessId();
      const cachedOverview = activateOverviewCache(businessId);
      overviewRef.current = cachedOverview || DEFAULT_OVERVIEW;
      setOverview(cachedOverview || DEFAULT_OVERVIEW);
      setLoading(!hasOverviewData(cachedOverview));
      setRefreshing(Boolean(cachedOverview));
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
