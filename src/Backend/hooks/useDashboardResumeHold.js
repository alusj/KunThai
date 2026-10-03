import { useEffect } from "react";
import { holdDashboardResume } from "../services/dashboardResume";

// While `active`, a long time in the background will NOT send the person back
// to their dashboard (e.g. live navigation or a trip in progress).
export function useDashboardResumeHold(active, reason) {
  useEffect(() => {
    if (!active) return undefined;
    return holdDashboardResume(reason);
  }, [active, reason]);
}
