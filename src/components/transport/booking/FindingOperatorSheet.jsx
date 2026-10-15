import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiClock, FiNavigation, FiRadio, FiRefreshCw, FiTrendingUp, FiX } from "react-icons/fi";

import { haptics, sounds } from "../../../Backend/services/feedbackService";
import { showToast } from "../../../Backend/services/toastService";
import { shortErrorToast } from "../../../Backend/services/friendlyErrorService";
import { useI18n, t } from "../../../i18n";
import { broadcastView, nextPollDelay, snapshotFromCreateResult } from "../../services/broadcastBookingModels";
import { cancelBroadcastBooking, fetchBroadcastStatus, subscribeBroadcastBooking } from "../../services/broadcastBookingService";

function isVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/**
 * Live "Finding an operator…" panel shown after an open booking is sent.
 * Polls the booking every 5 s while visible (and at once on any realtime
 * change of its requests), asks the server to widen the search when a wave
 * ends, and switches to the operator who accepted, an expiry message or the
 * cancelled state.
 */
export default function FindingOperatorSheet({ booking, canRaiseFare = false, onContinue, onKeepSearching, onRetry, onRaiseFare, onClose, onPhaseChange }) {
  useI18n();
  const startedAt = useRef(Date.now());
  const [snapshot, setSnapshot] = useState(() => snapshotFromCreateResult(booking, { now: startedAt.current }));
  const [now, setNow] = useState(() => Date.now());
  const [trouble, setTrouble] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const inFlightRef = useRef(false);
  const expandedWaveRef = useRef(null);
  const snapshotRef = useRef(snapshot);
  const announcedRef = useRef(false);
  const openBookingId = booking?.openBookingId || "";

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const refresh = useCallback(async ({ expand = false } = {}) => {
    if (!openBookingId || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const next = await fetchBroadcastStatus(openBookingId, { expand });
      if (next) setSnapshot((current) => ({ ...next, createdAt: next.createdAt ?? current?.createdAt ?? startedAt.current }));
      setTrouble(false);
    } catch {
      setTrouble(true);
    } finally {
      inFlightRef.current = false;
    }
  }, [openBookingId]);

  // One-second clock for the timers.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Poll while visible and still searching; pick up at once when shown again.
  useEffect(() => {
    if (!openBookingId) return undefined;
    let timer = null;
    let alive = true;
    const schedule = () => {
      window.clearTimeout(timer);
      const delay = nextPollDelay(snapshotRef.current, { now: Date.now(), visible: isVisible() });
      if (delay === null || !alive) return;
      timer = window.setTimeout(async () => {
        await refresh();
        if (alive) schedule();
      }, delay);
    };
    const onVisibility = () => {
      if (!isVisible()) return;
      refresh().finally(() => {
        if (alive) schedule();
      });
    };
    refresh().finally(() => {
      if (alive) schedule();
    });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [openBookingId, refresh]);

  // Realtime: an accept / decline on any request refreshes right away.
  useEffect(() => {
    if (!openBookingId) return undefined;
    let debounce = null;
    const unsubscribe = subscribeBroadcastBooking(openBookingId, () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => refresh(), 400);
    });
    return () => {
      window.clearTimeout(debounce);
      unsubscribe();
    };
  }, [openBookingId, refresh]);

  const view = useMemo(() => broadcastView(snapshot, { now, startedAt: startedAt.current }), [snapshot, now]);

  // The wave is over: ask the server to widen (once per wave).
  useEffect(() => {
    if (!view.expandDue || !snapshot || expandedWaveRef.current === snapshot.wave) return;
    expandedWaveRef.current = snapshot.wave;
    refresh({ expand: true });
  }, [refresh, snapshot, view.expandDue]);

  useEffect(() => {
    onPhaseChange?.(view.phase);
    if (view.phase === "accepted" && !announcedRef.current) {
      announcedRef.current = true;
      sounds.success("transport");
      haptics.medium("transport");
      showToast(t("urrideBroadcastBooking.toastAccepted"), "success");
    }
  }, [onPhaseChange, view.phase]);

  async function cancel() {
    if (cancelling) return;
    setCancelling(true);
    try {
      const next = await cancelBroadcastBooking(openBookingId, booking?.tripIds || []);
      if (next) setSnapshot((current) => ({ ...next, createdAt: next.createdAt ?? current?.createdAt ?? startedAt.current }));
      if (!next || next.status === "cancelled") showToast(t("urrideBroadcastBooking.toastCancelled"), "success");
    } catch (error) {
      showToast(shortErrorToast(error, t("urrideBroadcastBooking.toastCancelFailed")), "danger");
    } finally {
      setCancelling(false);
    }
  }

  const accepted = snapshot?.accepted || null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5" data-testid="finding-operator-sheet" aria-live="polite">
      {view.phase === "searching" ? (
        <section className="rounded-3xl border border-emerald-100 bg-white p-5 text-center shadow-sm">
          <span className="relative mx-auto grid h-20 w-20 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-200 opacity-60 motion-reduce:animate-none" aria-hidden="true" />
            <span className="relative grid h-16 w-16 place-items-center rounded-full bg-emerald-600 text-white">
              <FiRadio size={28} aria-hidden="true" />
            </span>
          </span>
          <h3 className="mt-4 text-xl font-black text-slate-950">{t("urrideBroadcastBooking.findingTitle")}</h3>
          <p className="mt-1 text-sm font-black text-emerald-700" data-testid="finding-sent-count">{t(view.sentKey, view.sentValues)}</p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
            <FiClock size={13} aria-hidden="true" />
            {t("urrideBroadcastBooking.elapsed", { time: view.elapsedLabel })}
          </p>
          {view.waveKey ? <p className="mt-3 text-sm font-bold text-slate-700">{t(view.waveKey, view.waveValues)}</p> : null}
          {view.countdownKey && view.secondsLeft > 0 ? (
            <p className="mt-1 text-xs font-semibold text-slate-500">{t(view.countdownKey, view.countdownValues)}</p>
          ) : null}
          <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">
            {snapshot?.mode === "legacy" ? t("urrideBroadcastBooking.legacyWaiting") : t("urrideBroadcastBooking.firstWins")}
          </p>
          {trouble ? <p className="mt-3 text-xs font-bold text-amber-700">{t("urrideBroadcastBooking.refreshTrouble")}</p> : null}
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={cancel}
              disabled={cancelling}
              className="kt-touchable inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 text-sm font-black text-red-700 disabled:opacity-60"
            >
              <FiX size={16} aria-hidden="true" />
              {cancelling ? t("urrideBroadcastBooking.cancelling") : t("urrideBroadcastBooking.cancel")}
            </button>
            <button
              type="button"
              onClick={onKeepSearching}
              className="kt-touchable inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800"
            >
              {snapshot?.mode === "legacy" ? t("urrideBroadcastBooking.viewTrips") : t("urrideBroadcastBooking.keepSearching")}
            </button>
          </div>
        </section>
      ) : null}

      {view.phase === "accepted" ? (
        <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm" data-testid="finding-accepted">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-emerald-600 text-white">
              <FiCheckCircle size={24} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-xl font-black text-slate-950">{t("urrideBroadcastBooking.acceptedTitle")}</h3>
              <p className="text-sm font-bold text-slate-700">
                {t("urrideBroadcastBooking.acceptedBody", { name: accepted?.operatorName || accepted?.fleetName || t("urrideBroadcastBooking.operatorFallback") })}
              </p>
            </div>
          </div>
          {accepted && (accepted.vehicle || accepted.plateNumber || accepted.distanceKm !== null) ? (
            <div className="mt-4 grid gap-1 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              {accepted?.fleetName && accepted?.operatorName ? <p className="font-black text-slate-900">{accepted.fleetName}</p> : null}
              {accepted?.vehicle && accepted?.plateNumber ? (
                <p>{t("urrideBroadcastBooking.vehicleLine", { vehicle: accepted.vehicle, plate: accepted.plateNumber })}</p>
              ) : accepted?.plateNumber ? (
                <p>{t("urrideBroadcastBooking.plateLine", { plate: accepted.plateNumber })}</p>
              ) : accepted?.vehicle ? (
                <p>{accepted.vehicle}</p>
              ) : null}
              {accepted?.distanceKm !== null && accepted?.distanceKm !== undefined && accepted?.etaMinutes ? (
                <p className="inline-flex items-center gap-1.5 text-emerald-700">
                  <FiNavigation size={13} aria-hidden="true" />
                  {t("urrideBroadcastBooking.distanceEta", { distance: accepted.distanceKm, eta: accepted.etaMinutes })}
                </p>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onContinue}
            className="kt-touchable mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700"
          >
            {t("urrideBroadcastBooking.continueToTrip")}
          </button>
        </section>
      ) : null}

      {view.phase === "expired" ? (
        <section className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm" data-testid="finding-expired">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-amber-100 text-amber-700">
              <FiAlertTriangle size={22} aria-hidden="true" />
            </span>
            <h3 className="text-xl font-black text-slate-950">{t("urrideBroadcastBooking.expiredTitle")}</h3>
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{t("urrideBroadcastBooking.expiredBody")}</p>
          <div className={`mt-5 grid gap-2 ${canRaiseFare ? "sm:grid-cols-2" : ""}`}>
            <button
              type="button"
              onClick={onRetry}
              className="kt-touchable inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700"
            >
              <FiRefreshCw size={16} aria-hidden="true" />
              {t("urrideBroadcastBooking.tryAgain")}
            </button>
            {canRaiseFare ? (
              <button
                type="button"
                onClick={onRaiseFare}
                className="kt-touchable inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-800"
              >
                <FiTrendingUp size={16} aria-hidden="true" />
                {t("urrideBroadcastBooking.raiseFare")}
              </button>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="mt-3 h-10 w-full rounded-xl text-sm font-black text-slate-600">
            {t("urrideBroadcastBooking.close")}
          </button>
        </section>
      ) : null}

      {view.phase === "cancelled" ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="finding-cancelled">
          <h3 className="text-xl font-black text-slate-950">{t("urrideBroadcastBooking.cancelledTitle")}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t("urrideBroadcastBooking.cancelledBody")}</p>
          <button
            type="button"
            onClick={onClose}
            className="kt-touchable mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800"
          >
            {t("urrideBroadcastBooking.close")}
          </button>
        </section>
      ) : null}
    </div>
  );
}
