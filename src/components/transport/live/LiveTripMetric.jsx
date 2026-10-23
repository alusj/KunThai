import { useEffect, useMemo, useRef, useState } from "react";

import { updateTransportTripProgress } from "../../services/bookingService";
import {
  distanceInMeters,
  formatTripDistance,
  formatTripElapsed,
  getElapsedTripSeconds,
} from "./liveTripMetricUtils";
import { useI18n, t } from "../../../i18n";
import { uiText as translateUi } from "../../../i18n/index.js";

const MIN_DISTANCE_UPDATE_METERS = 8;
const MIN_PROGRESS_SAVE_MS = 7000;

function useLiveTripMetric(trip) {
  const { locale: memoLocale } = useI18n();
  const [distanceMeters, setDistanceMeters] = useState(Number(trip?.distanceCoveredMeters || 0));
  const [clockNow, setClockNow] = useState(Date.now());
  const [trackingMessage, setTrackingMessage] = useState("");
  const previousPointRef = useRef(null);
  const latestDistanceRef = useRef(Number(trip?.distanceCoveredMeters || 0));
  const lastSavedAtRef = useRef(0);

  useEffect(() => {
    const nextDistance = Number(trip?.distanceCoveredMeters || 0);
    latestDistanceRef.current = Math.max(latestDistanceRef.current, nextDistance);
    setDistanceMeters((current) => Math.max(current, nextDistance));
  }, [trip?.distanceCoveredMeters]);

  useEffect(() => {
    if (!trip?.startedAt || !["in_progress", "paused"].includes(trip.rawStatus)) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [trip?.rawStatus, trip?.startedAt]);

  // A parcel owner is not in the vehicle: their phone must not meter the trip.
  // The operator's phone reports a delivery's distance and location.
  const isDelivery = trip?.tripType === "delivery";

  useEffect(() => {
    if (isDelivery || trip?.bookingMethod !== "distance" || trip?.rawStatus !== "in_progress") return undefined;
    if (!navigator.geolocation) {
      setTrackingMessage(t("urride.live.gpsUnavailable"));
      return undefined;
    }

    setTrackingMessage(t("urride.live.gpsActive"));
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const point = { lat: coords.latitude, lng: coords.longitude };
        const moved = distanceInMeters(previousPointRef.current, point);
        previousPointRef.current = point;
        if (!moved || moved > 250) return;

        latestDistanceRef.current += moved;
        setDistanceMeters(latestDistanceRef.current);
        const now = Date.now();
        if (moved < MIN_DISTANCE_UPDATE_METERS && now - lastSavedAtRef.current < MIN_PROGRESS_SAVE_MS) return;

        lastSavedAtRef.current = now;
        updateTransportTripProgress(trip.id, {
          distanceCoveredMeters: latestDistanceRef.current,
          latitude: point.lat,
          longitude: point.lng,
        }).catch(() => {
          setTrackingMessage(t("urride.live.gpsSyncing"));
        });
      },
      (error) => {
        setTrackingMessage(error.code === 1 ? t("urride.live.gpsAllow") : t("urride.live.gpsWeak"));
      },
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 12000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isDelivery, trip?.bookingMethod, trip?.id, trip?.rawStatus]);

  const elapsedSeconds = getElapsedTripSeconds(trip, clockNow);
  return useMemo(
    () => ({
      label: trip?.bookingMethod === "time" ? t("urride.live.timeLabel") : t("urride.live.distanceLabel"),
      value: trip?.bookingMethod === "time" ? formatTripElapsed(elapsedSeconds) : formatTripDistance(distanceMeters),
      detail: trip?.bookingMethod === "time"
        ? trip?.rawStatus === "paused" ? t("urride.live.timerPaused") : t("urride.live.counting")
        : isDelivery ? t("urrideParcel.distanceDetail") : trackingMessage || t("urride.live.gpsMovement"),
    }),
    [distanceMeters, elapsedSeconds, isDelivery, trackingMessage, trip?.bookingMethod, trip?.rawStatus, memoLocale],
  );
}

export default function LiveTripMetric({ trip, compact = false }) {
  useI18n();
  const metric = useLiveTripMetric(trip);

  return (
    <div className={`rounded-2xl border border-emerald-100 bg-emerald-50 ${compact ? "px-3 py-2" : "p-4"}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">{translateUi(metric.label)}</p>
      <p className={`${compact ? "mt-1 text-xl" : "mt-2 text-3xl"} font-black text-slate-950`}>{metric.value}</p>
      <p className="mt-1 text-xs font-bold text-emerald-700">{translateUi(metric.detail)}</p>
      <TripCardAccuracyNote bookingMethod={trip?.bookingMethod} />
    </div>
  );
}

// The live figure comes from the phones' GPS and clock, so it is only accurate
// while the screen is on with a good connection; the booking's agreed distance
// or time is what counts. Shown on the passenger's and the operator's trip card.
export function TripCardAccuracyNote({ bookingMethod = "distance" }) {
  useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <>
      <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-600" data-direction="urride-trip-card-accuracy">
        {bookingMethod === "time" ? t("urrideTripCard.stayActiveTime") : t("urrideTripCard.stayActiveDistance")}
        {" "}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          className="font-black text-emerald-700 underline underline-offset-2"
        >
          {moreOpen ? t("urrideTripCard.showLess") : t("urrideTripCard.readMore")}
        </button>
      </p>
      {moreOpen ? (
        <p className="mt-1 rounded-xl bg-white/70 px-2.5 py-2 text-[11px] font-semibold leading-4 text-slate-700">
          {t("urrideTripCard.accuracyDetail")}
        </p>
      ) : null}
    </>
  );
}
