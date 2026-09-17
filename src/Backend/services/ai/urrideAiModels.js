// KAI — pure UrRide helpers.
//
// What the model may know about places, trips and fleets, built from KunThai's
// own records. Coordinates, phone numbers, operator names and live positions
// are deliberately left out: the model has no use for them and must never be
// able to repeat or reason about them. Coordinates only travel from KunThai's
// place search straight into Area View.

import { formatCountryMoney } from "../../../data/globalCountryProfiles.js";

function clip(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** A place from KunThai's place search, as the model sees it. No coordinates. */
export function placeFactsForAi(place) {
  if (!place?.id) return null;
  const meters = finite(place.distanceMeters);
  return {
    id: String(place.id),
    name: clip(place.name || place.label, 100),
    address: clip(place.address || place.fullAddress, 160) || undefined,
    category: place.category || undefined,
    ...(meters !== null ? { distanceFromYouKm: Math.round(meters / 100) / 10 } : {}),
  };
}

/**
 * The Area View handoff for a place, using the same destination shape UrMall's
 * seller directions use. Coordinates come only from the place search result.
 */
export function areaViewDestinationFromPlace(place) {
  const lat = finite(place?.lat);
  const lng = finite(place?.lng);
  if (lat === null || lng === null) return null;
  return {
    type: "destination",
    id: `ai-place-${place.id}`,
    name: place.name || place.label || "Destination",
    label: place.name || place.label || "Destination",
    address: place.address || place.fullAddress || "",
    category: place.category || "Destination",
    searchQuery: place.fullAddress || place.address || place.name || "",
    country: place.country || "",
    countryCode: place.countryCode || "",
    lat,
    lng,
  };
}

/** One trip, as recorded by UrRide. No operator contact, no GPS points. */
export function tripFactsForAi(trip) {
  if (!trip?.id) return null;
  const fareRecorded = Number(trip.fareAmount || 0) > 0 && trip.fare ? String(trip.fare) : null;
  return {
    id: trip.id,
    type: trip.mode || undefined,
    title: clip(trip.title, 80) || undefined,
    status: trip.status || trip.rawStatus || undefined,
    stage: trip.stage ? clip(trip.stage, 80) : undefined,
    pickup: clip(trip.pickup, 120) || undefined,
    destination: clip(trip.destination, 120) || undefined,
    vehicle: trip.fleet?.fleetType || undefined,
    bookingMethod: trip.bookingMethod || undefined,
    fareRecordedByUrRide: fareRecorded || "not recorded yet",
    ...(Number(trip.distanceCoveredMeters) > 0 ? { distanceCoveredKmRecorded: Math.round(Number(trip.distanceCoveredMeters) / 100) / 10 } : {}),
    createdAt: trip.createdAt ? String(trip.createdAt).slice(0, 16) : undefined,
  };
}

/** Vehicle types KunThai offers in a country, from its capability config. */
export function transportOptionsFacts(capabilities, service = "both") {
  const describe = (options) => (Array.isArray(options) ? options : []).map((option) => ({ name: option.displayName || option.label, vehicle: option.value }));
  return {
    country: capabilities?.country?.name || undefined,
    ...(service !== "delivery" ? { rideOptions: describe(capabilities?.rideOptions) } : {}),
    ...(service !== "ride" ? { deliveryOptions: describe(capabilities?.deliveryOptions) } : {}),
    fares: "Not listed here: UrRide calculates each fare in the booking screen from the trip and the operator's rates.",
  };
}

export function operatorOverviewFacts(dashboard, currency = "") {
  if (!dashboard?.operator) return { error: "No UrRide operator account is set up for this person yet." };
  const reviews = dashboard.reviews || {};
  return {
    verification: dashboard.verificationCenter?.status || undefined,
    today: {
      completedTrips: dashboard.today?.trips ?? 0,
      earnings: formatCountryMoney(Number(dashboard.today?.earnings || 0), currency || ""),
      acceptanceRatePercent: dashboard.today?.acceptanceRate ?? null,
      averageResponseSeconds: dashboard.today?.averageResponseSeconds ?? null,
    },
    waitingRequests: (dashboard.waitingPassengers || []).length,
    availability: {
      acceptsRides: Boolean(dashboard.tripControls?.acceptsRide),
      acceptsDeliveries: Boolean(dashboard.tripControls?.acceptsDelivery),
      paused: Boolean(dashboard.tripControls?.pauseReason),
    },
    recentTrips: (dashboard.tripHistory || []).slice(0, 8).map((trip) => ({
      type: trip.requestType || trip.mode,
      status: trip.status,
      route: clip(trip.route, 140),
      fareRecordedByUrRide: trip.fare && trip.fare !== "Fare pending" ? trip.fare : "not recorded",
    })),
    reviews: {
      count: reviews.count || 0,
      averageRating: reviews.count ? Math.round(Number(reviews.averageRating || 0) * 10) / 10 : null,
      recent: (reviews.items || []).slice(0, 6).map((review) => ({ rating: review.rating, text: clip(review.reviewText, 200) || undefined })),
    },
    alerts: (dashboard.alerts || []).slice(0, 5).map((alert) => ({ type: alert.type, title: clip(alert.title, 100) })),
  };
}

function countBy(list, key) {
  return list.reduce((counts, item) => {
    const value = String(item?.[key] || "unknown");
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

export function companyOverviewFacts(company, bookings = []) {
  if (!company?.id) return { error: "No UrRide transport company is set up for this account yet." };
  const fleets = Array.isArray(company.fleets) ? company.fleets : [];
  const operators = fleets.flatMap((fleet) => fleet.operators || []);
  const liveBookings = Array.isArray(bookings) ? bookings : [];
  return {
    company: clip(company.companyName || company.name || company.businessName, 80) || undefined,
    verification: company.verificationStatus || undefined,
    fleets: {
      total: fleets.length,
      byType: countBy(fleets, "fleetType"),
      byVerification: countBy(fleets, "status"),
      byActivity: countBy(fleets, "activeStatus"),
      visibleToPassengers: fleets.filter((fleet) => fleet.isVisibleToPassengers).length,
    },
    operators: {
      total: operators.length,
      byStatus: countBy(operators, "status"),
    },
    liveBookings: {
      total: liveBookings.length,
      byStatus: countBy(liveBookings, "status"),
      byType: countBy(liveBookings, "requestType"),
      recent: liveBookings.slice(0, 6).map((booking) => ({
        status: booking.status,
        type: booking.requestType,
        fleet: clip(booking.fleetName, 60),
        route: clip(booking.route, 140),
      })),
    },
  };
}
