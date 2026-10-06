import { areaLocationDistanceMeters } from "./areaLocationTracking.js";

// Fleets chip: the live operators within this distance of the passenger.
export const FLEET_FOCUS_RADIUS_KM = 15;

function isPoint(value) {
  return Number.isFinite(Number(value?.lat)) && Number.isFinite(Number(value?.lng));
}

// Live operators within the radius of `reference`, nearest first. Without a
// reference point nothing can be measured, so nothing is "nearby".
export function operatorsWithinFleetRadius(operators = [], reference, radiusKm = FLEET_FOCUS_RADIUS_KM) {
  if (!isPoint(reference) || !Array.isArray(operators)) return [];
  const maxMeters = radiusKm * 1000;
  return operators
    .filter(isPoint)
    .map((operator) => ({ operator, meters: areaLocationDistanceMeters(reference, operator) }))
    .filter((entry) => entry.meters <= maxMeters)
    .sort((a, b) => a.meters - b.meters)
    .map((entry) => entry.operator);
}

// [[west, south], [east, north]] around the passenger and the operators, for
// map.fitBounds. Null when there is nothing to show.
export function fleetFocusBounds(operators = [], reference) {
  const points = [reference, ...operators].filter(isPoint);
  if (points.length < 2) return null;
  const lngs = points.map((point) => Number(point.lng));
  const lats = points.map((point) => Number(point.lat));
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

export function countFleetAvailability(operators = []) {
  return operators.reduce(
    (counts, operator) => {
      if (operator?.booked) counts.booked += 1;
      else counts.available += 1;
      return counts;
    },
    { available: 0, booked: 0 },
  );
}
