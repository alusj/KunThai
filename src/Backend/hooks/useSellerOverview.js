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

  async function loadOverview(active = true) {
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
  }

  useEffect(() => {
    let active = true;

    setLoading(true);
    loadOverview(active);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleMessagesUpdated() {
      loadOverview(true);
    }

    window.addEventListener("marketplace-message-sent", handleMessagesUpdated);
    window.addEventListener("marketplace-seller-messages-updated", handleMessagesUpdated);
    return () => {
      window.removeEventListener("marketplace-message-sent", handleMessagesUpdated);
      window.removeEventListener("marketplace-seller-messages-updated", handleMessagesUpdated);
    };
  }, []);

  return {
    ...overview,
    loading,
  };
}
