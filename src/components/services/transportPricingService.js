import { searchLocations } from "../../Backend/services/locationSearchService";
import { getRouteBetweenPoints } from "../../Backend/services/routeService";

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseCoordinateLabel(value) {
  const match = String(value || "").match(/\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?/);
  if (!match) return null;

  const lat = toFiniteNumber(match[1]);
  const lng = toFiniteNumber(match[2]);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function normalizePoint(point) {
  const lat = toFiniteNumber(point?.lat ?? point?.latitude);
  const lng = toFiniteNumber(point?.lng ?? point?.longitude);
  if (lat == null || lng == null) return null;
  return {
    ...point,
    lat,
    lng,
  };
}

async function resolveLocationPoint(label, center = null) {
  const directPoint = normalizePoint(label);
  if (directPoint) return directPoint;

  const parsed = parseCoordinateLabel(label);
  if (parsed) return parsed;

  const matches = await searchLocations(String(label || ""), center);
  return matches[0] || null;
}

export function formatSle(value) {
  const amount = Number(value || 0);
  return `SLE ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatBookingDistance(distanceKm) {
  const distance = Number(distanceKm || 0);
  if (!distance) return "Route distance pending";
  if (distance < 1) return `${Math.round(distance * 1000)} m`;
  return `${distance.toFixed(distance >= 10 ? 1 : 2)} km`;
}

export function calculateFleetFare(fleet, { bookingMethod = "distance", distanceKm = 0, bookedHours = 0 } = {}) {
  if (!fleet) return null;

  const baseFare = Math.max(0, Number(fleet.baseFare || 0));
  const rate = bookingMethod === "time"
    ? Math.max(0, Number(fleet.pricePerHour || 0))
    : Math.max(0, Number(fleet.pricePerKm || 0));
  const units = bookingMethod === "time" ? Math.max(0, Number(bookedHours || 0)) : Math.max(0, Number(distanceKm || 0));

  if (!rate || !units) {
    return {
      amount: baseFare || 0,
      baseFare,
      rate,
      units,
      ready: false,
    };
  }

  return {
    amount: Math.max(baseFare, rate * units),
    baseFare,
    rate,
    units,
    ready: true,
  };
}

export function describeFleetFare(fleet, input = {}) {
  const estimate = calculateFleetFare(fleet, input);
  if (!fleet) return "Choose an operator";

  if (input.bookingMethod === "time") {
    if (!Number(fleet.pricePerHour || 0)) return "Hourly rate not added";
    if (!estimate?.ready) return `${formatSle(fleet.pricePerHour)} per hour`;
  } else {
    if (!Number(fleet.pricePerKm || 0)) return "Distance rate not added";
    if (!estimate?.ready) return `${formatSle(fleet.pricePerKm)} per km`;
  }

  return formatSle(estimate.amount);
}

export async function calculateBookingRoute(pickup, dropoff, options = {}) {
  const center = normalizePoint(options.center);
  const start = await resolveLocationPoint(options.pickupPoint || pickup, center || options.destinationPoint);
  const end = await resolveLocationPoint(options.destinationPoint || dropoff, start || center);

  if (!start || !end) {
    throw new Error("We could not resolve both locations. Add a clearer street, junction, landmark, or current GPS location.");
  }

  const route = await getRouteBetweenPoints(start, end);
  const distanceKm = Number(route.distanceMeters || 0) / 1000;

  if (!distanceKm) {
    throw new Error("The route distance could not be calculated. Check both locations and try again.");
  }

  return {
    pickupPoint: start,
    destinationPoint: end,
    distanceKm,
    durationMinutes: Math.max(1, Math.round(Number(route.durationSeconds || 0) / 60)),
    approximate: Boolean(route.approximate),
  };
}
