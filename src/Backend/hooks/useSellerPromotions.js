import { useEffect, useState } from "react";

import { fetchSellerPromotions } from "../services/marketplace/sellerPromotionService";

const DEFAULT_PROMOTIONS = {
  activePromotions: [],
  suggestedProducts: [],
  performance: null,
  opportunities: [],
};

export function useSellerPromotions() {
  const [promotions, setPromotions] = useState(DEFAULT_PROMOTIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetchSellerPromotions()
      .then((nextPromotions) => {
        if (active) {
          setPromotions({ ...DEFAULT_PROMOTIONS, ...nextPromotions });
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
    ...promotions,
    loading,
  };
}
