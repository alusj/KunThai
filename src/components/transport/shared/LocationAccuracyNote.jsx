import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FiCrosshair, FiMapPin } from "react-icons/fi";

import { useI18n, t } from "../../../i18n";
import { locationAccuracyAdvice } from "../../services/liveDiscovery";
import { openOperatorLocationSettings } from "../../services/operatorLiveLocationService";
import {
  PRECISE_PURPOSE_PASSENGER,
  fixApproximateLocation,
  readKnownLocationAccuracy,
  readLocationAccuracy,
  subscribeLocationAccuracy,
} from "../../services/preciseLocationAccess";

function platform() {
  try {
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
}

// This phone's own position is rough, so the distances it shows (passenger)
// or that others see (operator) are rough too. Says how to fix it: when the
// phone only allows approximate location (iOS Precise Location off, Android
// "Approximate"), "Use precise location" asks the phone for it and, when the
// phone won't ask, opens KunThai's settings; otherwise Wi-Fi / going outside
// and a refresh. Nothing when the fix is fine.
export default function LocationAccuracyNote({
  accuracy,
  roughTextKey,
  onRefresh,
  refreshing = false,
  purpose = PRECISE_PURPOSE_PASSENGER,
  className = "",
}) {
  useI18n();
  const [access, setAccess] = useState(readKnownLocationAccuracy);
  const [fixing, setFixing] = useState(false);
  const rough = Number(accuracy) > 0;

  useEffect(() => {
    if (!rough) return undefined;
    let alive = true;
    const stop = subscribeLocationAccuracy((next) => {
      if (alive) setAccess(next);
    });
    readLocationAccuracy().then((next) => {
      if (alive) setAccess(next);
    });
    return () => {
      alive = false;
      stop();
    };
  }, [rough]);

  const os = platform();
  const advice = locationAccuracyAdvice({ accuracy, platform: os, reduced: access.accuracy === "reduced" });
  if (!advice) return null;
  const precise = advice.kind === "precise";

  async function askForPrecise() {
    setFixing(true);
    try {
      const on = await fixApproximateLocation({ purpose, openSettings: openOperatorLocationSettings });
      if (on) onRefresh?.();
    } finally {
      setFixing(false);
    }
  }

  const text = precise
    ? t(os === "android" ? "urrideLocationTrust.preciseLocationHintAndroid" : "urrideLocationTrust.preciseLocationHint", { m: advice.m })
    : t(roughTextKey, { m: advice.m });

  return (
    <div
      role="note"
      data-direction="urride-location-accuracy-note"
      data-location-advice={advice.kind}
      className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900 ${className}`}
    >
      <span className="min-w-0 flex-1">{text}</span>
      {precise || onRefresh ? (
        <button
          type="button"
          disabled={precise ? fixing : refreshing}
          onClick={() => (precise ? askForPrecise() : onRefresh())}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
        >
          {precise ? <FiCrosshair size={13} aria-hidden="true" /> : <FiMapPin size={13} aria-hidden="true" />}
          {precise ? t("urrideLocationTrust.usePreciseLocation") : t("urrideLocationTrust.refreshPosition")}
        </button>
      ) : null}
    </div>
  );
}
