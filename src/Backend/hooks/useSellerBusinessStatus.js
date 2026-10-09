import { useCallback, useEffect, useState } from "react";

import { MARKETPLACE_BUSINESS_CHANGED_EVENT, hasRegisteredBusiness } from "../services/marketplace/sellerRegistrationService";
import { registerSellerAccountReset } from "./sellerMemoryRegistry";

const SELLER_BUSINESS_STATUS_MEMORY = {
  checked: false,
  hasBusiness: false,
};

// A business that became active (e.g. a registration that finished in the
// background while UrMall was closed) means this account has one: reopening
// UrMall must show its dashboard, not the registration form. Only the memory
// is updated; a mounted registration screen finishes its own way.
function isBusinessActivated(event) {
  return Boolean(event?.detail?.businessId);
}

if (typeof window !== "undefined") {
  window.addEventListener(MARKETPLACE_BUSINESS_CHANGED_EVENT, (event) => {
    if (!isBusinessActivated(event)) return;
    SELLER_BUSINESS_STATUS_MEMORY.checked = true;
    SELLER_BUSINESS_STATUS_MEMORY.hasBusiness = true;
  });
}

// Whether this account has a business belongs to the signed-in account.
registerSellerAccountReset(() => {
  SELLER_BUSINESS_STATUS_MEMORY.checked = false;
  SELLER_BUSINESS_STATUS_MEMORY.hasBusiness = false;
});

export function useSellerBusinessStatus() {
  const [loading, setLoading] = useState(() => !SELLER_BUSINESS_STATUS_MEMORY.checked);
  const [hasBusiness, setHasBusinessState] = useState(() => SELLER_BUSINESS_STATUS_MEMORY.hasBusiness);
  // A failed check is not "no business": it must never open the registration
  // wizard for a seller who already has one.
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

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
    setError(false);

    hasRegisteredBusiness()
      .then((registered) => {
        SELLER_BUSINESS_STATUS_MEMORY.checked = true;
        SELLER_BUSINESS_STATUS_MEMORY.hasBusiness = Boolean(registered);
        if (active) setHasBusinessState(Boolean(registered));
      })
      .catch(() => {
        // Keep a remembered answer; only an unknown status becomes an error.
        if (active && !SELLER_BUSINESS_STATUS_MEMORY.checked) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  return {
    loading,
    isInitialLoading: loading && !SELLER_BUSINESS_STATUS_MEMORY.checked,
    hasBusiness,
    setHasBusiness,
    error,
    retry,
  };
}
