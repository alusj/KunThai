import { useEffect, useState } from "react";

import { fetchSellerReputation } from "../services/marketplace/sellerReputationService";

const DEFAULT_REPUTATION = {
  metrics: null,
  badges: [],
  reviewsNeedingResponse: [],
  recentReviews: [],
};

export function useSellerReputation() {
  const [reputation, setReputation] = useState(DEFAULT_REPUTATION);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetchSellerReputation()
      .then((nextReputation) => {
        if (active) {
          setReputation({ ...DEFAULT_REPUTATION, ...nextReputation });
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
    ...reputation,
    loading,
  };
}
