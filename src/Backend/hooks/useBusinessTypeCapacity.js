import { useCallback, useEffect, useState } from "react";
import { BUSINESS_PLAN_UPDATED_EVENT } from "../services/businessSubscriptionService";
import { fetchBusinessTypeCapacity } from "../services/marketplace/businessTypeCapacityService";

export default function useBusinessTypeCapacity(enabled = true) {
  const [capacity, setCapacity] = useState(null);
  const refresh = useCallback(async () => {
    const next = await fetchBusinessTypeCapacity();
    setCapacity(next);
    return next;
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = () => fetchBusinessTypeCapacity().then((next) => {
      if (alive) setCapacity(next);
    }).catch(() => {});
    load();
    window.addEventListener(BUSINESS_PLAN_UPDATED_EVENT, load);
    window.addEventListener("kunthai-marketplace-business-changed", load);
    return () => {
      alive = false;
      window.removeEventListener(BUSINESS_PLAN_UPDATED_EVENT, load);
      window.removeEventListener("kunthai-marketplace-business-changed", load);
    };
  }, [enabled]);
  return { capacity, refresh };
}
