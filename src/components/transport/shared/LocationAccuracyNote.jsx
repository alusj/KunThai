import { Capacitor } from "@capacitor/core";
import { FiMapPin, FiSettings } from "react-icons/fi";

import { useI18n, t } from "../../../i18n";
import { locationAccuracyAdvice } from "../../services/liveDiscovery";
import { openOperatorLocationSettings } from "../../services/operatorLiveLocationService";

function platform() {
  try {
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
}

// This phone's own position is rough, so the distances it shows (passenger)
// or that others see (operator) are rough too. Says how to fix it: Precise
// Location in Settings on an iPhone that reports iOS's approximate location,
// otherwise Wi-Fi / going outside and a refresh. Nothing when the fix is fine.
export default function LocationAccuracyNote({ accuracy, roughTextKey, onRefresh, refreshing = false, className = "" }) {
  useI18n();
  const advice = locationAccuracyAdvice({ accuracy, platform: platform() });
  if (!advice) return null;
  const precise = advice.kind === "precise";
  return (
    <div
      role="note"
      data-direction="urride-location-accuracy-note"
      className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900 ${className}`}
    >
      <span className="min-w-0 flex-1">
        {precise ? t("urrideLocationTrust.preciseLocationHint", { m: advice.m }) : t(roughTextKey, { m: advice.m })}
      </span>
      {precise || onRefresh ? (
        <button
          type="button"
          disabled={!precise && refreshing}
          onClick={() => (precise ? openOperatorLocationSettings() : onRefresh())}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
        >
          {precise ? <FiSettings size={13} aria-hidden="true" /> : <FiMapPin size={13} aria-hidden="true" />}
          {precise ? t("urrideBackgroundLocation.openSettings") : t("urrideLocationTrust.refreshPosition")}
        </button>
      ) : null}
    </div>
  );
}
