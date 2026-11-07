import { useEffect, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiChevronDown, FiChevronUp, FiMapPin, FiNavigation, FiPackage } from "react-icons/fi";

import { useI18n, t } from "../../../i18n";
import {
  readOperatorPublishStatus,
  subscribeOperatorPublishStatus,
} from "../../services/operatorLiveLocationService";

function titleKey(status, isDelivery) {
  if (status === "arrived") return "urrideSeatsTrip.arrivedTitle";
  if (status === "start_requested") return "urrideSeatsTrip.startRequestedTitle";
  if (status === "in_progress") return "urrideSeatsTrip.inProgressTitle";
  if (status === "paused") return "urrideSeatsTrip.pausedTitle";
  return isDelivery ? "urrideSeatsTrip.deliveryAcceptedTitle" : "urrideSeatsTrip.acceptedTitle";
}

// The operator's floating card once they accept a trip: it says the passenger
// can now track them (or, honestly, that they cannot while location sharing
// is off) and stays on the dashboard until the trip is completed or
// cancelled. It can be minimised to a small "Live" pill; a new trip opens it
// again. Cancelling and ending stay on the trip card, one tap away.
export default function OperatorTripAcceptedCard({ trip, onViewTrip, onViewRoute }) {
  useI18n();
  const [publish, setPublish] = useState(() => readOperatorPublishStatus());
  const [minimisedTripId, setMinimisedTripId] = useState("");
  const [shown, setShown] = useState(false);

  useEffect(() => subscribeOperatorPublishStatus(setPublish), []);

  // Slide in when a trip appears.
  useEffect(() => {
    if (!trip?.id) {
      setShown(false);
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(frame);
  }, [trip?.id]);

  if (!trip) return null;

  const status = trip.status || "accepted";
  const isDelivery = (trip.tripType || trip.raw?.trip_type || trip.raw?.trip_mode) === "delivery";
  const name = String(trip.name || "").trim() || t("urride.companyWs.passengerFallback");
  const tracking = publish.running && !publish.error;
  const minimised = minimisedTripId === trip.id;
  const TripIcon = isDelivery ? FiPackage : FiCheckCircle;

  if (minimised) {
    return (
      <button
        type="button"
        onClick={() => setMinimisedTripId("")}
        aria-label={t("urrideSeatsTrip.expand")}
        data-testid="operator-trip-accepted-pill"
        className="fixed right-3 z-[60] flex h-11 items-center gap-2 rounded-full px-4 text-sm font-black text-white shadow-[0_12px_30px_rgba(2,6,23,0.35)]"
        style={{ bottom: "calc(var(--kt-safe-area-bottom) + 0.75rem)", background: "linear-gradient(135deg, #047857, #0f172a)" }}
      >
        <LiveDot tracking={tracking} />
        <span className="max-w-[48vw] truncate">{t(titleKey(status, isDelivery))}</span>
        <FiChevronUp size={16} aria-hidden="true" />
      </button>
    );
  }

  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="operator-trip-accepted-card"
      className={`fixed inset-x-3 z-[60] mx-auto max-w-md overflow-hidden rounded-[26px] text-white shadow-[0_20px_50px_rgba(2,6,23,0.45)] ring-1 ring-white/10 transition-all duration-300 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
      style={{ bottom: "calc(var(--kt-safe-area-bottom) + 0.75rem)", background: "linear-gradient(140deg, #065f46 0%, #0f172a 62%, #0b1220 100%)" }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10" style={{ color: "#6ee7b7" }}>
            <TripIcon size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "#a7f3d0" }}>
              <LiveDot tracking={tracking} />
              {t("urrideSeatsTrip.liveBadge")}
            </span>
            <h2 className="mt-1 text-lg font-black leading-tight">{t(titleKey(status, isDelivery))}</h2>
            {trip.route ? (
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-semibold" style={{ color: "#cbd5e1" }}>
                <FiMapPin size={12} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{trip.route}</span>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setMinimisedTripId(trip.id)}
            aria-label={t("urrideSeatsTrip.minimise")}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <FiChevronDown size={18} aria-hidden="true" />
          </button>
        </div>

        <p
          className="mt-3 flex items-start gap-2 rounded-2xl px-3 py-2.5 text-xs font-bold leading-5"
          style={tracking
            ? { background: "rgba(16,185,129,0.16)", color: "#d1fae5" }
            : { background: "rgba(245,158,11,0.18)", color: "#fde68a" }}
        >
          {tracking
            ? <FiNavigation size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            : <FiAlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />}
          <span>{t(tracking ? "urrideSeatsTrip.trackingOn" : "urrideSeatsTrip.trackingOff", { name })}</span>
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onViewTrip}
            className="h-11 rounded-2xl text-sm font-black"
            style={{ background: "#ecfdf5", color: "#064e3b" }}
          >
            {t("urrideSeatsTrip.viewTrip")}
          </button>
          <button
            type="button"
            onClick={onViewRoute}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 text-sm font-black text-white hover:bg-white/20"
          >
            <FiNavigation size={15} aria-hidden="true" />
            {t("urrideSeatsTrip.route")}
          </button>
        </div>
      </div>
    </section>
  );
}

function LiveDot({ tracking }) {
  const color = tracking ? "#34d399" : "#fbbf24";
  return (
    <span className="relative flex h-2 w-2" aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: color }} />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}
