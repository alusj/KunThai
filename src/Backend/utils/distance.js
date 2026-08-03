// The single distance utility for KunThai.
//
// Distance is ALWAYS calculated directly between two coordinate pairs — the
// current user's coordinates and the target's saved coordinates — using the
// Haversine formula. It is never derived from an address string, city, country,
// road name, map centre, or a geocoded approximation. If either coordinate pair
// is missing or invalid, the distance is null and callers must show
// "Distance unavailable" rather than a fabricated value.

import { normalizeCoordinates } from "./coordinates.js";

export const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

// Great-circle distance in KILOMETRES between two coordinate pairs, or null when
// either pair is invalid. Accepts any object shape normalizeCoordinates accepts.
export function haversineKm(from, to) {
  const a = normalizeCoordinates(from);
  const b = normalizeCoordinates(to);
  if (!a || !b) return null;

  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Classify a kilometre value into a display band, without any locale text, so
// both the pure formatter and the i18n-aware label builder stay in lockstep:
//   < 0.1 km          -> "nearby"
//   0.1 km – < 1 km   -> "meters"      (rounded metres, 100–999)
//   1 km – < 10 km    -> "km-precise"  (one decimal place)
//   >= 10 km          -> "km-rounded"  (whole kilometres)
export function distanceBand(km) {
  if (km == null || !Number.isFinite(km) || km < 0) return "unavailable";
  if (km < 0.1) return "nearby";
  if (km < 1) return "meters";
  if (km < 10) return "km-precise";
  return "km-rounded";
}

export function metersFromKm(km) {
  return Math.round(km * 1000);
}

// Plain (English, non-i18n) formatter — used by tests and any non-UI caller.
// UI code should use resolveDistanceLabel so the strings are translated.
export function formatDistanceKm(km, { unavailableLabel = "Distance unavailable" } = {}) {
  switch (distanceBand(km)) {
    case "nearby":
      return "Nearby";
    case "meters":
      return `${metersFromKm(km)} m`;
    case "km-precise":
      return `${km.toFixed(1)} km`;
    case "km-rounded":
      return `${Math.round(km)} km`;
    default:
      return unavailableLabel;
  }
}

// i18n-aware label. `t` is the translation function; both coordinate pairs are
// validated before anything is shown. Returns the "distance unavailable" label
// (never a guess) when either pair is invalid.
export function resolveDistanceLabel(currentUserCoordinates, targetCoordinates, t) {
  const km = haversineKm(currentUserCoordinates, targetCoordinates);
  const band = distanceBand(km);
  switch (band) {
    case "nearby":
      return t("urmall.seller.nearby");
    case "meters":
      return t("urmall.seller.metersAway", { value: metersFromKm(km) });
    case "km-precise":
      return t("urmall.seller.kmAway", { value: km.toFixed(1) });
    case "km-rounded":
      return t("urmall.seller.kmAway", { value: Math.round(km) });
    default:
      return t("urmall.seller.distanceUnavailable");
  }
}
