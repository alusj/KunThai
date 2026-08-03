// Country boundary + border-uncertainty resolver (pure, dependency-injected).
//
// This module decides which COUNTRY a GPS reading belongs to, and — critically
// for a ride-hailing app near international borders — whether that decision is
// confident enough to act on. It never talks to the network itself: the caller
// injects a `lookupCountry(latitude, longitude)` function (maptiler / nominatim
// / an offline polygon lookup) so the logic here stays deterministic and fully
// testable.
//
// Why sampling instead of a single reverse-geocode of the centre point:
// GPS is inaccurate near borders. A single centre reading in Kambia (Sierra
// Leone) with a 3 km accuracy radius can easily reverse-geocode to Guinea. So
// when the accuracy circle is large enough to plausibly cross a border, we
// sample points around the accuracy ring. If they resolve to more than one
// country we treat the country as UNCERTAIN and ask the user to confirm — we
// never silently pick one side of a border.

import { normalizeCoordinates } from "../../utils/coordinates.js";
import { EARTH_RADIUS_KM } from "../../utils/distance.js";
import { normalizeCountryIso } from "../../../data/globalCountryProfiles.js";

// Accuracy at or below this (metres) is trusted as a precise, single-country
// fix — high confidence, no ring sampling needed.
export const HIGH_ACCURACY_METERS = 250;

// Only sample the accuracy ring when the reading is this fuzzy or fuzzier
// (metres). Below it, one border-crossing within the circle is not physically
// plausible, so the centre reading is authoritative and we save the extra
// lookups.
export const RING_SAMPLE_THRESHOLD_METERS = 400;

// Never sample further out than this (metres) even if the device reports an
// enormous accuracy radius — beyond this the fix is too weak to reason about
// per-country and we simply flag low confidence.
export const MAX_SAMPLE_RADIUS_METERS = 8000;

// Compass bearings (degrees) sampled around the ring.
const RING_BEARINGS_DEG = [0, 45, 90, 135, 180, 225, 270, 315];

// Destination point given a start, a distance (metres) and a bearing (degrees),
// via the great-circle formula. Used only to place ring sample points; the app
// still measures real distances with the Haversine helper in distance.js.
export function offsetCoordinate(latitude, longitude, distanceMeters, bearingDeg) {
  const angularDistance = distanceMeters / 1000 / EARTH_RADIUS_KM;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (latitude * Math.PI) / 180;
  const lng1 = (longitude * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (((lng2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

function isoFromLookup(result) {
  if (!result) return "";
  if (typeof result === "string") return normalizeCountryIso(result);
  return normalizeCountryIso(result.countryCode || result.country_code || result.iso2 || result.country);
}

function mostCommon(list) {
  const counts = new Map();
  for (const value of list) counts.set(value, (counts.get(value) || 0) + 1);
  let best = "";
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

// Resolve the country for a single trusted GPS reading.
//
// reading: { latitude, longitude, accuracyMeters }
// lookupCountry: async (lat, lng) => { countryCode } | iso string | null
//
// Returns null when the coordinates are invalid, otherwise:
//   {
//     countryCode,               // primary ISO-2 (the centre reading)
//     alternativeCountryCode,    // the nearby other country, when border-uncertain
//     isBorderUncertain,         // true => caller MUST confirm before acting
//     confidence: "high"|"medium"|"low",
//     sampledCountries: [ ... ], // distinct ISO-2 codes seen (centre + ring)
//   }
export async function resolveCountryFromReading(reading, lookupCountry, options = {}) {
  const coords = normalizeCoordinates(reading);
  if (!coords || typeof lookupCountry !== "function") return null;

  const highAccuracy = options.highAccuracyMeters ?? HIGH_ACCURACY_METERS;
  const ringThreshold = options.ringSampleThresholdMeters ?? RING_SAMPLE_THRESHOLD_METERS;
  const maxRadius = options.maxSampleRadiusMeters ?? MAX_SAMPLE_RADIUS_METERS;

  const accuracyMeters = Number(reading?.accuracyMeters);
  const hasAccuracy = Number.isFinite(accuracyMeters) && accuracyMeters >= 0;

  const centerIso = isoFromLookup(await lookupCountry(coords.latitude, coords.longitude));

  // Precise fix: trust the centre, no border ambiguity possible.
  const preciseFix = hasAccuracy && accuracyMeters <= highAccuracy;
  const shouldSampleRing = hasAccuracy && accuracyMeters >= ringThreshold;

  if (!shouldSampleRing) {
    if (!centerIso) return null;
    return {
      countryCode: centerIso,
      alternativeCountryCode: "",
      isBorderUncertain: false,
      confidence: preciseFix ? "high" : "medium",
      sampledCountries: [centerIso],
    };
  }

  // Sample the accuracy ring to detect a border crossing inside the circle.
  const radius = Math.min(accuracyMeters, maxRadius);
  const ringResults = await Promise.all(
    RING_BEARINGS_DEG.map((bearing) => {
      const point = offsetCoordinate(coords.latitude, coords.longitude, radius, bearing);
      return lookupCountry(point.latitude, point.longitude);
    }),
  );

  const ringIsos = ringResults.map(isoFromLookup).filter(Boolean);
  const allIsos = [centerIso, ...ringIsos].filter(Boolean);
  const distinct = Array.from(new Set(allIsos));

  if (!distinct.length) return null;

  if (distinct.length === 1) {
    return {
      countryCode: distinct[0],
      alternativeCountryCode: "",
      isBorderUncertain: false,
      // Single country but a fuzzy fix -> medium, never high.
      confidence: "medium",
      sampledCountries: distinct,
    };
  }

  // More than one country inside the accuracy circle: genuine border
  // uncertainty. Keep the centre reading as the primary suggestion and surface
  // the strongest competing neighbour as the alternative, but flag it so the
  // caller asks the user to confirm rather than guessing.
  const primary = centerIso || mostCommon(allIsos);
  const alternative = mostCommon(allIsos.filter((iso) => iso !== primary));

  return {
    countryCode: primary,
    alternativeCountryCode: alternative || "",
    isBorderUncertain: true,
    confidence: "low",
    sampledCountries: distinct,
  };
}
