import { useEffect, useState } from "react";

import { fetchParcelTracking } from "../../services/parcelHandoverService";

const POLL_MS = 20_000;
const LIVE_STATUSES = ["accepted", "arrived", "start_requested", "in_progress", "paused"];

export function isParcelPickupPhase(trip) {
  return trip?.tripType === "delivery" && ["accepted", "arrived", "start_requested"].includes(trip.rawStatus);
}

// Sender's view of a delivery: the codes, the receiver link and the rider's
// position. Polls while the delivery is live and reloads when the trip row
// changes (status, progress). Null until loaded, or when the database has no
// hand-over functions yet; the trip's own last position is the fallback.
export function useParcelTracking(trip) {
  const [tracking, setTracking] = useState(null);
  const tripId = trip?.tripType === "delivery" ? trip.id : "";
  const live = LIVE_STATUSES.includes(trip?.rawStatus);
  const revision = `${trip?.rawStatus || ""}:${trip?.updatedAt || ""}`;

  useEffect(() => {
    if (!tripId) return undefined;
    let cancelled = false;
    const load = () => {
      fetchParcelTracking(tripId)
        .then((next) => { if (!cancelled) setTracking(next); })
        .catch(() => {});
    };
    load();
    const timer = live ? window.setInterval(load, POLL_MS) : null;
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [tripId, live, revision]);

  const fallbackLat = Number.isFinite(trip?.lastLocationLatitude) ? trip.lastLocationLatitude : null;
  const fallbackLng = Number.isFinite(trip?.lastLocationLongitude) ? trip.lastLocationLongitude : null;
  const hasTrackedPosition = Number.isFinite(tracking?.riderLat) && Number.isFinite(tracking?.riderLng);
  return {
    tracking,
    position: hasTrackedPosition
      ? { lat: tracking.riderLat, lng: tracking.riderLng, at: tracking.riderLocatedAt }
      : fallbackLat !== null && fallbackLng !== null
        ? { lat: fallbackLat, lng: fallbackLng, at: trip?.lastLocationAt || "" }
        : null,
  };
}
