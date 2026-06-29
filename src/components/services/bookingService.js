import supabase from "../../Backend/lib/supabaseClient";
import { getActiveCountryProfile, getCountryCurrencyCode } from "../../data/westAfricanCountryProfiles";
import { calculateFleetFare } from "./transportPricingService";

async function getCurrentPassenger(message = "Sign in to book transport.") {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error(message);

  const meta = data.user.user_metadata || {};
  return {
    id: data.user.id,
    name: meta.full_name || meta.name || meta.username || data.user.email?.split("@")[0] || "Passenger",
  };
}

function normalizeTripType(mode, fleet) {
  if (mode === "delivery") return "delivery";
  if (mode === "ride") return "ride";
  if (fleet?.serviceCategory === "Delivery") return "delivery";
  return "ride";
}

function buildBookingTitle({ mode, fleet, passengers, packageDescription }) {
  const tripType = normalizeTripType(mode, fleet);
  const serviceName = fleet?.displayType || fleet?.fleetType || (tripType === "delivery" ? "Delivery" : "Ride");

  if (tripType === "delivery") {
    return `${serviceName} delivery request${packageDescription ? ` - ${packageDescription}` : ""}`;
  }

  return `${serviceName} ride request${passengers ? ` - ${passengers} passenger${Number(passengers) === 1 ? "" : "s"}` : ""}`;
}

function buildPassengerName(passenger, booking) {
  return String(booking.passengerName || passenger.name || "Passenger").trim();
}

function buildScheduledAt(booking) {
  if (booking.pickupTime !== "schedule" || !booking.scheduledAt) return null;
  const date = new Date(booking.scheduledAt);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeBookingFleets(booking, fallbackFleet) {
  const targetFleets = Array.isArray(booking.targetFleets) ? booking.targetFleets : [];
  const fleets = targetFleets.length ? targetFleets : [fallbackFleet].filter((fleet) => fleet?.id);
  const seen = new Set();

  return fleets.filter((fleet) => {
    if (!fleet?.id || seen.has(fleet.id)) return false;
    seen.add(fleet.id);
    return true;
  });
}

function buildTripAlert({ trip, fleet, booking, passengerName, tripType, now }) {
  const operatorId = fleet?.operatorRecordId || fleet?.operator_id || fleet?.operatorId || "";
  if (!operatorId || !trip?.id) return null;

  const pickup = String(booking.pickup || "").trim();
  const dropoff = String(booking.dropoff || booking.destination || "").trim();
  const phone = String(booking.phone || "").trim();
  const body = [
    `${passengerName} sent a ${tripType === "delivery" ? "delivery" : "ride"} request near your fleet.`,
    pickup && dropoff ? `Route: ${pickup} to ${dropoff}.` : "",
    phone ? `Passenger contact: ${phone}.` : "Passenger contact is available inside the request.",
  ].filter(Boolean).join(" ");

  return {
    operator_id: operatorId,
    alert_type: "passenger_request",
    title: tripType === "delivery" ? "New delivery request" : "New ride request",
    body,
    action_label: "Open passenger request",
    action_target: `trip:${trip.id}`,
    status: "unread",
    created_at: now,
  };
}

async function notifyOperatorsAboutTrips({ trips, fleets, booking, passengerName, tripType, now }) {
  const fleetById = new Map(fleets.map((fleet) => [String(fleet.id), fleet]));
  const alerts = trips
    .map((trip) => buildTripAlert({ trip, fleet: fleetById.get(String(trip.fleet_id)), booking, passengerName, tripType, now }))
    .filter(Boolean);

  if (!alerts.length) return;

  try {
    await supabase.from("transport_operator_alerts").insert(alerts);
  } catch {
    // Trip rows are the source of truth; alerts are an additional notification surface.
  }
}

function shouldTryLegacyTripPayload(error) {
  const message = String(error?.message || "");
  return /column|schema cache|could not find/i.test(message);
}

export async function createTransportBooking(booking) {
 
  if (!String(booking.pickup || "").trim()) {
    throw new Error("Add a pickup point before sending the booking.");
  }

  if (!String(booking.dropoff || booking.destination || "").trim()) {
    throw new Error("Add a drop-off point before sending the booking.");
  }

  const passenger = await getCurrentPassenger();
  const fleet = booking.fleet || {};
  const targetFleets = normalizeBookingFleets(booking, fleet);
  if (!targetFleets.length) {
    throw new Error("Choose at least one nearby operator before sending this booking.");
  }

  const tripType = normalizeTripType(booking.mode, fleet);
  const passengerName = buildPassengerName(passenger, booking);
  const now = new Date().toISOString();
  const title = buildBookingTitle({ ...booking, mode: tripType, fleet });
  const bookingMethod = booking.bookingMethod === "time" ? "time" : "distance";

  const payloads = targetFleets.map((targetFleet) => {
    const fareCurrency = targetFleet.currency || getCountryCurrencyCode(targetFleet.countryCode || targetFleet.country || booking.countryCode || booking.country);
    const countryProfile = getActiveCountryProfile(targetFleet.countryCode || targetFleet.country || booking.countryCode || booking.country);
    const fare = calculateFleetFare(targetFleet, {
      bookingMethod,
      distanceKm: booking.distanceKm,
      bookedHours: booking.bookedHours,
    });

    return {
      passenger_id: passenger.id,
      passenger_name: passengerName,
      fleet_id: targetFleet.id,
      trip_type: tripType,
      trip_mode: tripType,
      title,
      pickup_label: String(booking.pickup || "").trim(),
      destination_label: String(booking.dropoff || booking.destination || "").trim(),
      contact_phone: String(booking.phone || "").trim() || null,
      package_description: tripType === "delivery" ? String(booking.packageDescription || "").trim() || null : null,
      trip_note: String(booking.note || "").trim() || null,
      country: targetFleet.country || booking.country || countryProfile.name,
      country_iso: targetFleet.countryCode || booking.countryCode || countryProfile.iso2,
      booking_method: bookingMethod,
      estimated_distance_km: booking.distanceKm ? Number(booking.distanceKm) : null,
      booked_hours: bookingMethod === "time" && booking.bookedHours ? Number(booking.bookedHours) : null,
      pickup_latitude: booking.pickupPoint?.lat ?? null,
      pickup_longitude: booking.pickupPoint?.lng ?? null,
      destination_latitude: booking.destinationPoint?.lat ?? null,
      destination_longitude: booking.destinationPoint?.lng ?? null,
      base_fare_snapshot: fare?.baseFare || null,
      rate_snapshot: fare?.rate || null,
      fare_amount: fare?.ready ? fare.amount : null,
      fare_currency: fareCurrency,
      scheduled_at: buildScheduledAt(booking),
      status: "requested",
      created_at: now,
      updated_at: now,
    };
  });

  const legacyPayloads = payloads.map((payload) => ({
    passenger_id: passenger.id,
    fleet_id: payload.fleet_id,
    trip_mode: tripType,
    pickup_label: payload.pickup_label,
    destination_label: payload.destination_label,
    fare_amount: payload.fare_amount,
    fare_currency: payload.fare_currency,
    scheduled_at: payload.scheduled_at,
    status: "requested",
    created_at: now,
    updated_at: now,
  }));

  let { data, error } = await supabase
    .from("transport_trips")
    .insert(payloads)
    .select();

  if (error && shouldTryLegacyTripPayload(error)) {
    const legacyResult = await supabase
      .from("transport_trips")
      .insert(legacyPayloads)
      .select();

    data = Array.isArray(legacyResult.data)
      ? legacyResult.data.map((trip) => ({
          ...trip,
          passenger_name: passengerName,
          trip_type: trip.trip_type || trip.trip_mode || tripType,
          title: trip.title || title,
        }))
      : legacyResult.data;
    error = legacyResult.error;
  }

  if (error) {
    throw new Error(error.message || "Unable to send this booking to the operator.");
  }

  const trips = Array.isArray(data) ? data : [data].filter(Boolean);
  await notifyOperatorsAboutTrips({ trips, fleets: targetFleets, booking, passengerName, tripType, now });
  const primaryTrip = trips[0] || null;

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("transport-booking-created", {
      detail: {
        booking: primaryTrip,
        trips,
        notifiedFleetCount: trips.length,
      },
    }));
  }

  return {
    ...primaryTrip,
    broadcastTrips: trips,
    notifiedFleetCount: trips.length,
  };
}

export async function updateTransportTripStatus(tripId, status, patch = {}) {
  if (!tripId) throw new Error("Choose a trip to update.");
  if (!status) throw new Error("Choose the next trip status.");

  const payload = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (patch.fareAmount !== undefined && patch.fareAmount !== "") {
    payload.fare_amount = Number(patch.fareAmount);
    payload.fare_currency = patch.fareCurrency || getCountryCurrencyCode(patch.countryCode || patch.country);
  }

  if (patch.startRequestedAt !== undefined) payload.start_requested_at = patch.startRequestedAt;
  if (patch.startedAt !== undefined) payload.started_at = patch.startedAt;
  if (patch.pausedAt !== undefined) payload.paused_at = patch.pausedAt;
  if (patch.pausedSeconds !== undefined) payload.paused_seconds = Math.max(0, Number(patch.pausedSeconds || 0));
  if (patch.distanceCoveredMeters !== undefined) payload.distance_covered_meters = Math.max(0, Number(patch.distanceCoveredMeters || 0));
  if (patch.lastLocationLatitude !== undefined) payload.last_location_latitude = patch.lastLocationLatitude;
  if (patch.lastLocationLongitude !== undefined) payload.last_location_longitude = patch.lastLocationLongitude;
  if (patch.lastLocationAt !== undefined) payload.last_location_at = patch.lastLocationAt;
  if (patch.endedBy !== undefined) payload.ended_by = patch.endedBy;

  const { data, error } = await supabase
    .from("transport_trips")
    .update(payload)
    .eq("id", tripId)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Unable to update this trip.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("transport-trip-updated", { detail: { trip: data } }));
  }

  return data;
}

export async function cancelTransportTrip(tripId) {
  return updateTransportTripStatus(tripId, "cancelled");
}

export async function requestTransportTripStart(tripId) {
  return updateTransportTripStatus(tripId, "start_requested", {
    startRequestedAt: new Date().toISOString(),
  });
}

export async function confirmTransportTripStart(tripId) {
  return updateTransportTripStatus(tripId, "in_progress", {
    startedAt: new Date().toISOString(),
    pausedAt: null,
  });
}

export async function declineTransportTripStart(tripId) {
  return updateTransportTripStatus(tripId, "arrived", {
    startRequestedAt: null,
  });
}

export async function pauseTransportTrip(trip) {
  return updateTransportTripStatus(trip.id, "paused", {
    pausedAt: new Date().toISOString(),
  });
}

export async function continueTransportTrip(trip) {
  const pausedAt = trip.pausedAt ? new Date(trip.pausedAt).getTime() : Date.now();
  const additionalPausedSeconds = Math.max(0, Math.round((Date.now() - pausedAt) / 1000));
  return updateTransportTripStatus(trip.id, "in_progress", {
    pausedAt: null,
    pausedSeconds: Number(trip.pausedSeconds || 0) + additionalPausedSeconds,
  });
}

export async function endTransportTrip(trip) {
  const currentPausedSeconds = trip.pausedAt
    ? Number(trip.pausedSeconds || 0) + Math.max(0, Math.round((Date.now() - new Date(trip.pausedAt).getTime()) / 1000))
    : Number(trip.pausedSeconds || 0);
  const elapsedSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(trip.startedAt || Date.now()).getTime()) / 1000) - currentPausedSeconds,
  );
  const rate = Number(trip.rateSnapshot || 0);
  const baseFare = Number(trip.baseFareSnapshot || 0);
  const units = trip.bookingMethod === "time"
    ? elapsedSeconds / 3600
    : Number(trip.distanceCoveredMeters || 0) / 1000;
  const fareAmount = rate ? Math.max(baseFare, rate * units) : Number(trip.fareAmount || 0);

  return updateTransportTripStatus(trip.id, "completed", {
    fareAmount,
    pausedAt: null,
    pausedSeconds: currentPausedSeconds,
    endedBy: "passenger",
  });
}

export async function updateTransportTripProgress(tripId, progress) {
  if (!tripId) return null;

  const { data, error } = await supabase
    .from("transport_trips")
    .update({
      distance_covered_meters: Math.max(0, Number(progress.distanceCoveredMeters || 0)),
      last_location_latitude: Number(progress.latitude),
      last_location_longitude: Number(progress.longitude),
      last_location_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", tripId)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message || "Unable to update live trip distance.");
  return data;
}

export async function submitTransportSupportTicket(input) {
  const passenger = await getCurrentPassenger("Sign in to prepare a support ticket.");
  const ticket = {
    id: `local-support-${Date.now()}`,
    passengerId: passenger.id,
    passengerName: passenger.name,
    tripId: input.tripId || "",
    fleetId: input.fleetId || "",
    topic: input.topic || "Trip support",
    priority: input.priority || "normal",
    body: String(input.body || "").trim(),
    createdAt: new Date().toISOString(),
  };

  if (!ticket.body) throw new Error("Add a clear support message first.");

  const { data, error } = await supabase
    .from("transport_support_tickets")
    .insert({
      passenger_id: ticket.passengerId,
      passenger_name: ticket.passengerName,
      trip_id: ticket.tripId || null,
      fleet_id: ticket.fleetId || null,
      topic: ticket.topic,
      priority: ticket.priority,
      body: ticket.body,
      status: "open",
      created_at: ticket.createdAt,
    })
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Unable to send this request to KunThai Transport support.");
  }
  return { synced: true, ticket: data };
}

export async function submitTransportTripReview({ trip, rating, comment }) {
  const passenger = await getCurrentPassenger("Sign in to review this trip.");
  const score = Number(rating || 0);
  if (!trip?.fleet?.operatorRecordId) throw new Error("Operator review record is not available yet.");
  if (score < 1) throw new Error("Choose a rating before submitting.");

  const { error } = await supabase.from("transport_operator_reviews").insert({
    operator_id: trip.fleet.operatorRecordId,
    passenger_name: passenger.name,
    rating: score,
    review_text: String(comment || "").trim(),
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message || "Unable to submit this review.");
  return updateTransportTripStatus(trip.id, "completed");
}
