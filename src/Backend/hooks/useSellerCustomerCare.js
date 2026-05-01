import { useEffect, useState } from "react";

import { fetchSellerCustomerCare } from "../services/marketplace/sellerCustomerCareService";

const DEFAULT_CUSTOMER_CARE = {
  metrics: null,
  conversations: [],
  supportThreads: [],
};

export function useSellerCustomerCare() {
  const [customerCare, setCustomerCare] = useState(DEFAULT_CUSTOMER_CARE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

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

  return {
    ...customerCare,
    loading,
  };
}
