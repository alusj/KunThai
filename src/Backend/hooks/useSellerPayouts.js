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

export function useSellerPayouts() {
  const [payouts, setPayouts] = useState(DEFAULT_PAYOUTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetchSellerPayouts()
      .then((nextPayouts) => {
        if (active) {
          setPayouts({ ...DEFAULT_PAYOUTS, ...nextPayouts });
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
    ...payouts,
    loading,
  };
}
