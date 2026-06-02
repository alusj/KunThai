import supabase from "../../Backend/lib/supabaseClient";
import { calculateFleetFare } from "./transportPricingService";

const SUPPORT_DRAFTS_KEY = "kuntai.transport.supportDrafts";

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

function shouldTryLegacyTripPayload(error) {
  const message = String(error?.message || "");
  return /column|schema cache|could not find/i.test(message);
}

function readLocalJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
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
  const tripType = normalizeTripType(booking.mode, fleet);
  const passengerName = buildPassengerName(passenger, booking);
  const now = new Date().toISOString();
  const title = buildBookingTitle({ ...booking, mode: tripType, fleet });
  const bookingMethod = booking.bookingMethod === "time" ? "time" : "distance";
  const fare = calculateFleetFare(fleet, {
    bookingMethod,
    distanceKm: booking.distanceKm,
    bookedHours: booking.bookedHours,
  });

  const payload = {
    passenger_id: passenger.id,
    passenger_name: passengerName,
    fleet_id: booking.fleetId || fleet.id || null,
    trip_type: tripType,
    trip_mode: tripType,
    title,
    pickup_label: String(booking.pickup || "").trim(),
    destination_label: String(booking.dropoff || booking.destination || "").trim(),
    contact_phone: String(booking.phone || "").trim() || null,
    package_description: tripType === "delivery" ? String(booking.packageDescription || "").trim() || null : null,
    trip_note: String(booking.note || "").trim() || null,
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
    fare_currency: "SLE",
    scheduled_at: buildScheduledAt(booking),
    status: booking.fleetId || fleet.id ? "requested" : "waiting_operator",
    created_at: now,
    updated_at: now,
  };

  const legacyPayload = {
    passenger_id: passenger.id,
    fleet_id: booking.fleetId || fleet.id,
    trip_mode: tripType,
    pickup_label: payload.pickup_label,
    destination_label: payload.destination_label,
    fare_amount: null,
    fare_currency: "SLE",
    scheduled_at: payload.scheduled_at,
    status: "requested",
    created_at: now,
    updated_at: now,
  };

  let { data, error } = await supabase
    .from("transport_trips")
    .insert(payload)
    .select()
    .maybeSingle();

  if (error && shouldTryLegacyTripPayload(error)) {
    const legacyResult = await supabase
      .from("transport_trips")
      .insert(legacyPayload)
      .select()
      .maybeSingle();

    data = legacyResult.data
      ? {
          ...legacyResult.data,
          passenger_name: passengerName,
          trip_type: legacyResult.data.trip_type || legacyResult.data.trip_mode || tripType,
          title: legacyResult.data.title || title,
        }
      : legacyResult.data;
    error = legacyResult.error;
  }

  if (error) {
    throw new Error(error.message || "Unable to send this booking to the operator.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("transport-booking-created", { detail: { booking: data } }));
  }

  return data;
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
    payload.fare_currency = patch.fareCurrency || "SLE";
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

  try {
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

    if (error) throw error;
    return { synced: true, ticket: data };
  } catch {
    const drafts = readLocalJson(SUPPORT_DRAFTS_KEY, []);
    writeLocalJson(SUPPORT_DRAFTS_KEY, [ticket, ...(Array.isArray(drafts) ? drafts : [])]);
    return { synced: false, ticket };
  }
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
