import { useCallback, useEffect, useState } from "react";

import { fetchSellerCustomerCare } from "../services/marketplace/sellerCustomerCareService";

const DEFAULT_CUSTOMER_CARE = {
  metrics: null,
  conversations: [],
  supportThreads: [],
};

export function useSellerCustomerCare() {
  const [customerCare, setCustomerCare] = useState(DEFAULT_CUSTOMER_CARE);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextCustomerCare = await fetchSellerCustomerCare();
      setCustomerCare({ ...DEFAULT_CUSTOMER_CARE, ...nextCustomerCare });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    setLoading(true);
    fetchSellerCustomerCare()
      .then((nextCustomerCare) => {
        if (active) {
          setCustomerCare({ ...DEFAULT_CUSTOMER_CARE, ...nextCustomerCare });
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

  useEffect(() => {
    window.addEventListener("marketplace-message-sent", load);
    return () => window.removeEventListener("marketplace-message-sent", load);
  }, [load]);

  return {
    ...customerCare,
    loading,
    reload: load,
  };
}
