import { useEffect, useState } from "react";

import { fetchSellerOverview } from "../services/marketplace/sellerOverviewService";

const DEFAULT_OVERVIEW = {
  business: null,
  storeStatus: null,
  health: null,
  today: null,
};

export function useSellerOverview() {
  const [overview, setOverview] = useState(DEFAULT_OVERVIEW);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetchSellerOverview()
      .then((nextOverview) => {
        if (active) {
          setOverview({ ...DEFAULT_OVERVIEW, ...nextOverview });
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
    ...overview,
    loading,
  };
}
