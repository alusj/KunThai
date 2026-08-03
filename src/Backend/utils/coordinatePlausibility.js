// Sanity-check that a coordinate could plausibly belong to the country written
// on the record. This does NOT drive any user-facing distance (coordinates
// remain the source of truth); it exists to surface data-entry mistakes — like a
// "Sierra Leone" business whose saved point is in South Sudan — during
// development and, optionally, to decide when to hide a clearly-broken value.
//
// KunThai is global, so this is an extensible bounding-box map, not a hardcoded
// single country. Unknown countries return null ("cannot tell"), never false.

import { normalizeCoordinates } from "./coordinates.js";

// [minLatitude, minLongitude, maxLatitude, maxLongitude], generous padding.
const COUNTRY_BOUNDS = {
  "sierra leone": [6.8, -13.4, 10.1, -10.2],
  "south sudan": [3.4, 24.0, 12.3, 35.9],
  liberia: [4.2, -11.6, 8.6, -7.3],
  guinea: [7.1, -15.1, 12.7, -7.6],
};

function normalizeCountryKey(country) {
  return String(country ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

export function hasCountryBounds(country) {
  return Object.prototype.hasOwnProperty.call(COUNTRY_BOUNDS, normalizeCountryKey(country));
}

// Returns true (plausible), false (coordinate is outside the country's box), or
// null when the country is unknown or the coordinate is invalid.
export function isCoordinatePlausibleForCountry(input, country) {
  const coords = normalizeCoordinates(input);
  if (!coords) return null;
  const bounds = COUNTRY_BOUNDS[normalizeCountryKey(country)];
  if (!bounds) return null;
  const [minLat, minLng, maxLat, maxLng] = bounds;
  return (
    coords.latitude >= minLat &&
    coords.latitude <= maxLat &&
    coords.longitude >= minLng &&
    coords.longitude <= maxLng
  );
}
