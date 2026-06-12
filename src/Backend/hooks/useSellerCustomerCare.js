import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSellerCustomerCare } from "../services/marketplace/sellerCustomerCareService";

const DEFAULT_CUSTOMER_CARE = {
  metrics: null,
  conversations: [],
  supportThreads: [],
};

const SELLER_CUSTOMER_CARE_MEMORY = {
  customerCare: null,
  savedAt: 0,
};

function normalizeCustomerCare(customerCare) {
  return { ...DEFAULT_CUSTOMER_CARE, ...customerCare };
}

function hasCustomerCareData(customerCare) {
  return Boolean(
    customerCare?.metrics ||
      customerCare?.conversations?.length ||
      customerCare?.supportThreads?.length,
  );
}

export function useSellerCustomerCare() {
  const [customerCare, setCustomerCare] = useState(() => SELLER_CUSTOMER_CARE_MEMORY.customerCare || DEFAULT_CUSTOMER_CARE);
  const [loading, setLoading] = useState(() => !hasCustomerCareData(SELLER_CUSTOMER_CARE_MEMORY.customerCare));
  const [refreshing, setRefreshing] = useState(false);
  const customerCareRef = useRef(customerCare);

  useEffect(() => {
    customerCareRef.current = customerCare;
  }, [customerCare]);

  const load = useCallback(async () => {
    const cachedCustomerCare = SELLER_CUSTOMER_CARE_MEMORY.customerCare;
    const hasCachedCustomerCare = hasCustomerCareData(cachedCustomerCare) || hasCustomerCareData(customerCareRef.current);

    if (cachedCustomerCare) {
      setCustomerCare(cachedCustomerCare);
    }

    if (hasCachedCustomerCare) {
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    try {
      const nextCustomerCare = normalizeCustomerCare(await fetchSellerCustomerCare());
      SELLER_CUSTOMER_CARE_MEMORY.customerCare = nextCustomerCare;
      SELLER_CUSTOMER_CARE_MEMORY.savedAt = Date.now();
      setCustomerCare(nextCustomerCare);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const cachedCustomerCare = SELLER_CUSTOMER_CARE_MEMORY.customerCare;

    if (cachedCustomerCare) {
      setCustomerCare(cachedCustomerCare);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    fetchSellerCustomerCare()
      .then((nextCustomerCare) => {
        const normalizedCustomerCare = normalizeCustomerCare(nextCustomerCare);
        SELLER_CUSTOMER_CARE_MEMORY.customerCare = normalizedCustomerCare;
        SELLER_CUSTOMER_CARE_MEMORY.savedAt = Date.now();
        if (active) {
          setCustomerCare(normalizedCustomerCare);
        }
      })
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

  useEffect(() => {
    window.addEventListener("marketplace-message-sent", load);
    window.addEventListener("marketplace-seller-messages-updated", load);
    return () => {
      window.removeEventListener("marketplace-message-sent", load);
      window.removeEventListener("marketplace-seller-messages-updated", load);
    };
  }, [load]);

  return {
    ...customerCare,
    loading,
    isInitialLoading: loading && !hasCustomerCareData(customerCare),
    refreshing,
    isRefreshing: refreshing,
    reload: load,
  };
}
