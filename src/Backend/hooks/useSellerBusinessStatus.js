import { useEffect, useState } from "react";

import { hasRegisteredBusiness } from "../services/marketplace/sellerRegistrationService";

export function useSellerBusinessStatus() {
  const [loading, setLoading] = useState(true);
  const [hasBusiness, setHasBusiness] = useState(false);

  useEffect(() => {
    let active = true;

    hasRegisteredBusiness()
      .then((registered) => {
        if (active) setHasBusiness(registered);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { loading, hasBusiness, setHasBusiness };
}
