import { useEffect, useState } from "react";

import { hasRegisteredBusiness } from "../services/marketplace/sellerRegistrationService";

const SELLER_BUSINESS_STATUS_MEMORY = {
  checked: false,
  hasBusiness: false,
};

export function useSellerBusinessStatus() {
  const [loading, setLoading] = useState(() => !SELLER_BUSINESS_STATUS_MEMORY.checked);
  const [hasBusiness, setHasBusinessState] = useState(() => SELLER_BUSINESS_STATUS_MEMORY.hasBusiness);

  function setHasBusiness(nextValue) {
    setHasBusinessState((current) => {
      const value = typeof nextValue === "function" ? Boolean(nextValue(current)) : Boolean(nextValue);
      SELLER_BUSINESS_STATUS_MEMORY.checked = true;
      SELLER_BUSINESS_STATUS_MEMORY.hasBusiness = value;
      return value;
    });
  }

  useEffect(() => {
    let active = true;

    if (!SELLER_BUSINESS_STATUS_MEMORY.checked) {
      setLoading(true);
    } else {
      setLoading(false);
    }

    hasRegisteredBusiness()
      .then((registered) => {
        SELLER_BUSINESS_STATUS_MEMORY.checked = true;
        SELLER_BUSINESS_STATUS_MEMORY.hasBusiness = Boolean(registered);
        if (active) setHasBusinessState(Boolean(registered));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { loading, isInitialLoading: loading && !SELLER_BUSINESS_STATUS_MEMORY.checked, hasBusiness, setHasBusiness };
}
