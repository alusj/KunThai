// Canonical coordinate handling for KunThai.
//
// THE source of truth for any location — seller, shop, property, service,
// driver, destination, or user — is a numeric latitude/longitude pair in this
// exact shape:
//
//   { latitude: number, longitude: number }
//
// Written addresses are for display only and must never be used to derive
// distance. GeoJSON / mapping libraries use [longitude, latitude] order; this
// module is the single place that converts between that order and the app
// object so the two can never be accidentally swapped.

export const LATITUDE_MIN = -90;
export const LATITUDE_MAX = 90;
export const LONGITUDE_MIN = -180;
export const LONGITUDE_MAX = 180;

// Accept safe numeric strings ("8.484"), reject null/undefined/""/NaN/booleans.
export function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function isValidLatitude(value) {
  const n = toFiniteNumber(value);
  return n !== null && n >= LATITUDE_MIN && n <= LATITUDE_MAX;
}

export function isValidLongitude(value) {
  const n = toFiniteNumber(value);
  return n !== null && n >= LONGITUDE_MIN && n <= LONGITUDE_MAX;
}

// 0,0 (Null Island, in the Atlantic off Africa) is almost always an accidental
// default rather than a real business location, so it is rejected.
export function isNullIsland(latitude, longitude, epsilon = 1e-7) {
  return Math.abs(latitude) < epsilon && Math.abs(longitude) < epsilon;
}

// Normalize an OBJECT-shaped coordinate ({latitude,longitude}, {lat,lng},
// {lat,lon}) into the canonical shape, or null when it is missing, out of
// range, non-numeric, or the 0,0 default. Bare arrays are intentionally NOT
// accepted here because [a, b] is ambiguous — use fromGeoJSON / fromLatLngArray
// so the order is explicit and can never be reversed by accident.
export function normalizeCoordinates(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const latitude = toFiniteNumber(input.latitude ?? input.lat);
  const longitude = toFiniteNumber(input.longitude ?? input.lng ?? input.lon);
  if (latitude === null || longitude === null) return null;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  if (isNullIsland(latitude, longitude)) return null;
  return { latitude, longitude };
}

export function isValidCoordinates(input) {
  return normalizeCoordinates(input) !== null;
}

// GeoJSON position is ALWAYS [longitude, latitude]. Keep this the only door
// between GeoJSON order and the app object.
export function fromGeoJSON(position) {
  if (!Array.isArray(position) || position.length < 2) return null;
  return normalizeCoordinates({ longitude: position[0], latitude: position[1] });
}

export function toGeoJSON(input) {
  const coords = normalizeCoordinates(input);
  return coords ? [coords.longitude, coords.latitude] : null;
}

// Explicit [latitude, longitude] array (e.g. Leaflet-style), never GeoJSON.
export function fromLatLngArray(position) {
  if (!Array.isArray(position) || position.length < 2) return null;
  return normalizeCoordinates({ latitude: position[0], longitude: position[1] });
}

// Canonical -> { lat, lng } for legacy consumers (maplibre camera, older
// helpers). Prefer the canonical object everywhere new.
export function toLatLng(input) {
  const coords = normalizeCoordinates(input);
  return coords ? { lat: coords.latitude, lng: coords.longitude } : null;
}
