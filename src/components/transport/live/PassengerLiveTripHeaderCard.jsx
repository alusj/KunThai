import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiFlag,
  FiMoreHorizontal,
  FiNavigation,
  FiPause,
  FiPhone,
  FiPlay,
  FiShare2,
  FiShield,
  FiX,
  FiXCircle,
} from "react-icons/fi";

import { showToast } from "../../../Backend/services/toastService";
import {
  confirmTransportTripStart,
  declineTransportTripStart,
} from "../../services/bookingService";
import {
  fetchActiveTrips,
  subscribePassengerTrips,
} from "../../services/passengerTransportService";
import LiveTripMetric from "./LiveTripMetric";
import { useI18n, t } from "../../../i18n";

function isHeaderTrip(trip) {
  return ["start_requested", "in_progress", "paused"].includes(trip.rawStatus);
}

export default function PassengerLiveTripHeaderCard({ onOpenTrips }) {
  useI18n();
  const [trips, setTrips] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const closeTimerRef = useRef(null);

  const clearCloseTimer = useCallback(() => {
    if (!closeTimerRef.current || typeof window === "undefined") return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const closeMenu = useCallback((immediate = false) => {
    clearCloseTimer();
    if (immediate) {
      setMenuOpen(false);
      setMenuClosing(false);
      return;
    }

    setMenuOpen((wasOpen) => {
      if (wasOpen) {
        setMenuClosing(true);
        closeTimerRef.current = window.setTimeout(() => {
          setMenuClosing(false);
          closeTimerRef.current = null;
        }, 190);
      }
      return false;
    });
  }, [clearCloseTimer]);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    setMenuClosing(false);
    setMenuOpen(true);
  }, [clearCloseTimer]);

  const toggleMenu = useCallback(() => {
    if (menuOpen && !menuClosing) closeMenu();
    else openMenu();
  }, [closeMenu, menuClosing, menuOpen, openMenu]);

  const refresh = useCallback(async () => {
    try {
      setTrips(await fetchActiveTrips());
    } catch {
      setTrips([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    return subscribePassengerTrips(refresh);
  }, [refresh]);

  const trip = useMemo(() => trips.find(isHeaderTrip) || null, [trips]);

  useEffect(() => {
    closeMenu(true);
  }, [closeMenu, trip?.id, trip?.rawStatus]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event) {
      const target = event.target;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      closeMenu();
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") closeMenu();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, menuOpen]);

  async function run(action, successMessage) {
    try {
      setBusy(true);
      await action(trip.id);
      showToast(successMessage, "success");
      await refresh();
    } catch (error) {
      showToast(error.message || t("urride.liveTrip.updateError"), "danger");
    } finally {
      setBusy(false);
    }
  }

  function openAction(type) {
    closeMenu(true);
    onOpenTrips?.({ tripId: trip.id, type });
  }

  if (!trip) return null;

  const operatorName = trip.fleet?.operatorName || trip.fleet?.fleetName || t("urride.liveTrip.operatorFallback");
  const paused = trip.rawStatus === "paused";

  return (
    <section className="relative mx-3 mt-3 overflow-visible rounded-[28px] border border-emerald-100 bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:mx-5">
      {trip.rawStatus === "start_requested" ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
              <FiShield size={14} />
              {t("urride.liveTrip.startApproval")}
            </p>
            <h2 className="mt-1 text-base font-black text-slate-950">{t("urride.liveTrip.wantsToStart", { operator: operatorName })}</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">{t("urride.liveTrip.confirmHint")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => run(confirmTransportTripStart, t("urride.liveTrip.startedToast"))}
              disabled={busy}
              className="kt-touchable flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50"
            >
              <FiPlay size={16} />
              {t("urride.liveTrip.start")}
            </button>
            <button
              type="button"
              onClick={() => run(declineTransportTripStart, t("urride.liveTrip.startCancelledToast"))}
              disabled={busy}
              className="kt-touchable flex h-11 items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 text-sm font-black text-red-700 disabled:opacity-50"
            >
              <FiX size={16} />
              {t("urride.liveTrip.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                <FiNavigation size={14} />
                {t("urride.liveTrip.tripUpdated")}
              </p>
              <h2 className="mt-1 break-words text-lg font-black leading-tight text-slate-950">{trip.title}</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {t("urride.liveTrip.statusLine", { operator: operatorName, status: paused ? t("urride.liveTrip.paused") : t("urride.liveTrip.inProgress") })}
              </p>
            </div>

            <button
              ref={menuButtonRef}
              type="button"
              onClick={toggleMenu}
              className="kt-touchable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-950 text-white shadow-sm"
              aria-expanded={menuOpen}
              aria-label={t("urride.liveTrip.safetyActionsAria")}
            >
              <FiMoreHorizontal size={18} />
            </button>
          </div>

          <div className="mt-3">
            <LiveTripMetric trip={trip} compact />
          </div>

          {menuOpen || menuClosing ? (
            <div
              ref={menuRef}
              className={`absolute right-4 top-14 z-40 w-[min(86vw,390px)] rounded-[24px] border border-slate-100 bg-slate-950 p-3 text-white shadow-2xl shadow-slate-950/25 ${
                menuClosing ? "kt-live-actions-pop-out pointer-events-none" : "kt-live-actions-pop"
              }`}
            >
              <div className="mb-3 rounded-2xl bg-white/10 px-3 py-2">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-200">{t("urride.liveTrip.safetyReady")}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-200">
                  {t("urride.liveTrip.chooseAction")}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <PassengerAction icon={paused ? FiPlay : FiPause} label={paused ? t("urride.liveTrip.continueTrip") : t("urride.liveTrip.pauseTrip")} onClick={() => openAction("pause")} />
                <PassengerAction icon={FiShare2} label={t("urride.liveTrip.shareLocation")} onClick={() => openAction("share")} />
                <PassengerAction icon={FiPhone} label={t("urride.liveTrip.contactOperator")} onClick={() => openAction("contact")} />
                <PassengerAction icon={FiAlertTriangle} label={t("urride.liveTrip.emergency")} danger onClick={() => openAction("emergency")} />
                <PassengerAction icon={FiFlag} label={t("urride.liveTrip.report")} onClick={() => openAction("report")} />
                <PassengerAction icon={FiXCircle} label={t("urride.liveTrip.endTrip")} danger onClick={() => openAction("end")} />
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function PassengerAction({ icon, label, danger = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kt-touchable flex h-11 items-center gap-2 rounded-2xl px-3 text-left text-xs font-black transition ${
        danger ? "bg-red-500/15 text-red-100 hover:bg-red-500/25" : "bg-white/10 text-white hover:bg-white/15"
      }`}
    >
      {createElement(icon, { size: 16 })}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
