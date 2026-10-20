import { useEffect, useState } from "react";
import { FiMapPin, FiSettings } from "react-icons/fi";

import { useI18n, t } from "../../i18n";
import { describeOperatorVisibility } from "../services/liveDiscovery";
import {
  openOperatorLocationSettings,
  readOperatorPublishStatus,
  startOperatorLiveLocation,
  subscribeOperatorPublishStatus,
  refreshOperatorLocationNow,
} from "../services/operatorLiveLocationService";

// Operator dashboard, while Active (Online): two separate lines, both from
// what this phone actually did, never from the Active switch alone.
//   Location   — Sharing / Starting / Paused / Delayed / Error (permission
//                refused, no GPS fix, or the database refused the position)
//   Passengers — Visible only while a position was saved in the last
//                2 minutes (the window passenger discovery uses)
// Green while visible; amber otherwise, with a button that (re)starts sharing
// (the tap may show the location permission prompt — nothing here prompts on
// its own). In the
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

  // A rough fix (no GPS indoors, Wi-Fi scanning off): passengers would see
  // the wrong distance, so the operator is told how to fix it.
  const roughAccuracy = status.running && Number(status.accuracy) > 100 ? Math.round(Number(status.accuracy)) : 0;
  const accuracyHint = roughAccuracy ? (
    <div
      role="note"
      data-direction="urride-operator-accuracy-hint"
      className="-mt-2 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900"
    >
      <span className="min-w-0 flex-1">{t("urrideLocationTrust.roughOperatorHint", { m: roughAccuracy })}</span>
      <button
        type="button"
        onClick={() => refreshOperatorLocationNow()}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100"
      >
        <FiMapPin size={13} aria-hidden="true" />
        {t("urrideLocationTrust.refreshPosition")}
      </button>
    </div>
  ) : null;

  const locationText = {
    sharing: t("urrideLiveDiscovery.locationSharing", { seconds: view.seconds ?? 0 }),
    starting: t("urrideLiveDiscovery.locationStarting"),
    paused: t("urrideLiveDiscovery.locationPaused"),
    delayed: t("urrideLiveDiscovery.locationDelayed"),
    error: view.error === "permission"
      ? t("urrideLiveDiscovery.locationPermission")
      : view.error === "write"
        ? t("urrideLiveDiscovery.locationWriteFailed")
        : t("urrideLiveDiscovery.locationNoFix"),
  }[view.sharing];
  const locationDot = {
    sharing: "bg-emerald-600",
    starting: "bg-sky-500",
    paused: "bg-slate-400",
    delayed: "bg-amber-500",
    error: "bg-red-500",
  }[view.sharing];
  // "Share location" restarts sharing whenever it isn't working; "starting"
  // is already on its way.
  const canShare = view.sharing !== "sharing" && view.sharing !== "starting";

  return (
    <>
      <div
        role="status"
        data-direction="urride-operator-visibility"
        data-sharing={view.sharing}
        data-visible={view.visible ? "true" : "false"}
        className={`mb-4 rounded-2xl border px-4 py-2.5 text-xs font-bold ${
          view.visible
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid min-w-0 flex-1 gap-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${locationDot}`} aria-hidden="true" />
              <span className="font-black">{t("urrideLiveDiscovery.locationLabel")}:</span>
              <span className="min-w-0">{locationText}</span>
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${view.visible ? "bg-emerald-600" : "bg-amber-500"}`}
                aria-hidden="true"
              />
              <span className="font-black">{t("urrideLiveDiscovery.passengersLabel")}:</span>
              <span>{view.visible ? t("urrideLiveDiscovery.passengersVisible") : t("urrideLiveDiscovery.passengersHidden")}</span>
            </span>
          </div>
          {canShare ? (
            <button
              type="button"
              onClick={share}
              disabled={starting}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-70"
            >
              <FiMapPin size={13} aria-hidden="true" />
              {starting ? t("urrideLiveDiscovery.sharing") : t("urrideLiveDiscovery.shareLocation")}
            </button>
          ) : null}
        </div>
      </div>
      {accessHint}
      {accuracyHint}
    </>
  );
}
