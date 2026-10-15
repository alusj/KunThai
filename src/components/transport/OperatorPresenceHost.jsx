import { useEffect } from "react";

import { presenceResumeAction } from "../services/operatorLocationPolicy";
import {
  isOperatorLiveLocationRunning,
  operatorLocationPreviouslyGranted,
  startOperatorLiveLocation,
  stopOperatorLiveLocation,
} from "../services/operatorLiveLocationService";
import OperatorBackgroundLocationSheet from "./OperatorBackgroundLocationSheet";

// A solo operator who is online keeps sharing their position while KunThai is
// open on any screen (and, in the native app, with the phone locked), so
// passengers see how far away they are ("1.2 km away") and the Area View
// marker stays fresh. The operator dashboard starts and stops it with the
// Active switch; this host only resumes it when the app opens (or returns to
// the foreground) with the operator already online, and only if location was
// allowed before, so it never prompts. It also hosts the native "stay visible
// with your phone locked" explanation sheet.
export default function OperatorPresenceHost({ userId = "" }) {
  useEffect(() => {
    if (!userId) {
      stopOperatorLiveLocation();
      return undefined;
    }

    let alive = true;

    async function resume() {
      if (!alive || isOperatorLiveLocationRunning() || !operatorLocationPreviouslyGranted()) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const { getOperatorAccount } = await import("../services/transportOperatorAccountService");
        const account = await getOperatorAccount();
        if (!alive) return;
        const action = presenceResumeAction({
          running: isOperatorLiveLocationRunning(),
          previouslyGranted: operatorLocationPreviouslyGranted(),
          account,
        });
        if (action !== "start") return;
        await startOperatorLiveLocation({
          displayName: account.form?.name || "KunThai operator",
          fleetType: account.form?.fleetType || "",
        });
      } catch {
        // Best-effort: without it the fleet stays bookable, just without a distance.
      }
    }

    const timer = window.setTimeout(resume, 4000);
    const onVisible = () => {
      if (document.visibilityState === "visible") resume();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      // Signing out (or switching account) stops sharing the old account's
      // position, including the native background watcher.
      stopOperatorLiveLocation();
    };
  }, [userId]);

  return <OperatorBackgroundLocationSheet />;
}
