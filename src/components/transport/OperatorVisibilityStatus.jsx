import { useEffect, useState } from "react";
import { FiMapPin, FiSettings } from "react-icons/fi";

import { useI18n, t } from "../../i18n";
import { describeOperatorVisibility } from "../services/liveDiscovery";
import {
  openOperatorLocationSettings,
  readOperatorPublishStatus,
  startOperatorLiveLocation,
  subscribeOperatorPublishStatus,
} from "../services/operatorLiveLocationService";

// Operator dashboard, while Active: passengers only list an operator whose
// phone checked in during the last 2 minutes. Green while that holds; amber
// otherwise, with a button that starts sharing (the tap may show the
// location permission prompt — nothing here prompts on its own). In the
// native app, an amber hint below it offers Settings when location is only
// allowed "While using" (iOS) or is off, since sharing with the phone locked
// needs more.
export default function OperatorVisibilityStatus({ displayName = "", fleetType = "", isBooked }) {
  useI18n();
  const [status, setStatus] = useState(() => readOperatorPublishStatus());
  const [now, setNow] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);

  useEffect(
    () =>
      subscribeOperatorPublishStatus((next) => {
        setStatus(next);
        setNow(Date.now());
      }),
    [],
  );

  // Only re-renders the age label; no network.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") setNow(Date.now());
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const view = describeOperatorVisibility({ ...status, now });

  async function share() {
    if (starting) return;
    setStarting(true);
    try {
      await startOperatorLiveLocation({
        displayName: displayName || "KunThai operator",
        fleetType,
        isBooked: typeof isBooked === "function" ? isBooked : () => false,
        interactive: true,
      });
    } catch {
      // Best-effort: the line stays amber and the operator can try again.
    } finally {
      setStarting(false);
    }
  }

  const accessHint =
    status.engine === "native" && (status.access === "foregroundOnly" || status.access === "denied") ? (
      <div
        role="note"
        data-direction="urride-operator-background-hint"
        className="-mt-2 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900"
      >
        <span className="min-w-0 flex-1">
          {status.access === "denied"
            ? t("urrideBackgroundLocation.deniedHint")
            : t("urrideBackgroundLocation.foregroundOnlyHint")}
        </span>
        <button
          type="button"
          onClick={() => openOperatorLocationSettings()}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100"
        >
          <FiSettings size={13} aria-hidden="true" />
          {t("urrideBackgroundLocation.openSettings")}
        </button>
      </div>
    ) : null;

  if (view.visible) {
    return (
      <>
        <div
          role="status"
          data-direction="urride-operator-visibility"
          className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />
          <span>{t("urrideLiveDiscovery.visible", { seconds: view.seconds })}</span>
        </div>
        {accessHint}
      </>
    );
  }

  return (
    <>
      <div
        role="status"
        data-direction="urride-operator-visibility"
        className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
          <span>{t("urrideLiveDiscovery.notVisible")}</span>
        </span>
        <button
          type="button"
          onClick={share}
          disabled={starting}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-70"
        >
          <FiMapPin size={13} aria-hidden="true" />
          {starting ? t("urrideLiveDiscovery.sharing") : t("urrideLiveDiscovery.shareLocation")}
        </button>
      </div>
      {accessHint}
    </>
  );
}
