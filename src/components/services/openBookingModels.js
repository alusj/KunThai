import { calculateFleetFare } from "./transportFareMath.js";

// Pure open-booking helpers (no app imports), unit-tested under Node.

// UI vehicle values (globalTransportCapabilities) -> database fleet types.
const FLEET_TYPE_TO_DB = { Motorcycle: "motorcycle", Tricycle: "tricycle", Car: "car" };

export function toDbFleetType(value) {
  return FLEET_TYPE_TO_DB[value] || String(value || "").trim().toLowerCase();
}

// Seats per vehicle, for open and fleet bookings alike: motorbike 1,
// tricycle 3, taxi 4. Unknown vehicle ("any fleet") allows the taxi maximum.
const MAX_PASSENGERS = { motorcycle: 1, tricycle: 3, car: 4 };

export function maxPassengersForVehicle(value) {
  return MAX_PASSENGERS[toDbFleetType(value)] || 4;
}

// Fares are offered in round amounts: whole units, or steps of 5 from 100 up.
export function roundOfferAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 100) return Math.max(5, Math.round(value / 5) * 5);
  return Math.max(1, Math.round(value));
}

/**
 * Three offers built from what operators of this vehicle type charge for the
 * route: Economy (a little under the average), Average, and Priority (a little
 * over, to be picked up sooner). Null when no operator has published prices.
 */
export function buildFareOffers(fleets = [], { distanceKm = 0 } = {}) {
  const amounts = fleets
    .map((fleet) => calculateFleetFare(fleet, { bookingMethod: "distance", distanceKm }))
    .filter((fare) => fare && (fare.ready || fare.baseFare > 0))
    .map((fare) => (fare.ready ? fare.amount : fare.baseFare))
    .filter((amount) => Number.isFinite(amount) && amount > 0);

  if (!amounts.length) return null;
  const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const averageOffer = roundOfferAmount(average);
  return {
    sampleSize: amounts.length,
    economy: Math.min(averageOffer, roundOfferAmount(average * 0.85)),
    average: averageOffer,
    priority: Math.max(averageOffer, roundOfferAmount(average * 1.2)),
  };
}

const WAITING_STATUSES = ["requested", "waiting_operator", "pending_confirmation"];

/**
 * The requests of one open booking are separate trip rows. Passenger lists
 * show the booking once, in the position of its first row: the accepted
 * request if there is one, otherwise the first waiting one.
 */
export function collapseOpenBookingTrips(rows = []) {
  const kept = new Map();
  const result = [];
  for (const row of rows) {
    const group = row?.open_booking_id;
    if (!group) {
      result.push(row);
      continue;
    }
    const current = kept.get(group);
    if (!current) {
      kept.set(group, { row, index: result.length });
      result.push(row);
    } else if (WAITING_STATUSES.includes(current.row.status) && !WAITING_STATUSES.includes(row.status)) {
      result[current.index] = row;
      kept.set(group, { row, index: current.index });
    }
  }
  return result;
}
