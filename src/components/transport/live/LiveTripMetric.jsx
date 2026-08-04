import { useEffect, useMemo, useRef, useState } from "react";

import { updateTransportTripProgress } from "../../services/bookingService";
import {
  distanceInMeters,
  formatTripDistance,
  formatTripElapsed,
  getElapsedTripSeconds,
} from "./liveTripMetricUtils";
import { useI18n, t } from "../../../i18n";

const MIN_DISTANCE_UPDATE_METERS = 8;
const MIN_PROGRESS_SAVE_MS = 7000;

function useLiveTripMetric(trip) {
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

  useEffect(() => {
    if (trip?.bookingMethod !== "distance" || trip?.rawStatus !== "in_progress") return undefined;
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
  }, [trip?.bookingMethod, trip?.id, trip?.rawStatus]);

  const elapsedSeconds = getElapsedTripSeconds(trip, clockNow);
  return useMemo(
    () => ({
      label: trip?.bookingMethod === "time" ? t("urride.live.timeLabel") : t("urride.live.distanceLabel"),
      value: trip?.bookingMethod === "time" ? formatTripElapsed(elapsedSeconds) : formatTripDistance(distanceMeters),
      detail: trip?.bookingMethod === "time"
        ? trip?.rawStatus === "paused" ? t("urride.live.timerPaused") : t("urride.live.counting")
        : trackingMessage || t("urride.live.gpsMovement"),
    }),
    [distanceMeters, elapsedSeconds, trackingMessage, trip?.bookingMethod, trip?.rawStatus],
  );
}

export default function LiveTripMetric({ trip, compact = false }) {
  useI18n();
  const metric = useLiveTripMetric(trip);

  return (
    <div className={`rounded-2xl border border-emerald-100 bg-emerald-50 ${compact ? "px-3 py-2" : "p-4"}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">{metric.label}</p>
      <p className={`${compact ? "mt-1 text-xl" : "mt-2 text-3xl"} font-black text-slate-950`}>{metric.value}</p>
      <p className="mt-1 text-xs font-bold text-emerald-700">{metric.detail}</p>
    </div>
  );
}
