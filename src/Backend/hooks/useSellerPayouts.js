import { useEffect, useState } from "react";

import { fetchSellerPayouts } from "../services/marketplace/sellerPayoutService";

const DEFAULT_PAYOUTS = {
  availableBalance: 0,
  pendingBalance: 0,
  lastPayout: null,
  nextPayout: null,
  withdrawalMethod: null,
  warning: null,
  recentTransactions: [],
};

const SELLER_PAYOUTS_MEMORY = {
  loaded: false,
  payouts: DEFAULT_PAYOUTS,
  savedAt: 0,
};

function normalizePayouts(payouts) {
  return { ...DEFAULT_PAYOUTS, ...payouts };
}

export function useSellerPayouts() {
  const [payouts, setPayouts] = useState(() => SELLER_PAYOUTS_MEMORY.payouts);
  const [loading, setLoading] = useState(() => !SELLER_PAYOUTS_MEMORY.loaded);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    const hasCachedPayouts = SELLER_PAYOUTS_MEMORY.loaded;

    if (hasCachedPayouts) {
      setPayouts(SELLER_PAYOUTS_MEMORY.payouts);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    fetchSellerPayouts()
      .then((nextPayouts) => {
        const normalizedPayouts = normalizePayouts(nextPayouts);
        SELLER_PAYOUTS_MEMORY.loaded = true;
        SELLER_PAYOUTS_MEMORY.payouts = normalizedPayouts;
        SELLER_PAYOUTS_MEMORY.savedAt = Date.now();
        if (active) {
          setPayouts(normalizedPayouts);
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
    ...payouts,
    loading,
    isInitialLoading: loading && !SELLER_PAYOUTS_MEMORY.loaded,
    refreshing,
    isRefreshing: refreshing,
  };
}
