import supabase from "../../Backend/lib/supabaseClient";

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
  if (!booking?.fleet?.id && !booking?.fleetId) {
    throw new Error("Choose an available operator before sending the booking.");
  }

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

  const payload = {
    passenger_id: passenger.id,
    passenger_name: passengerName,
    fleet_id: booking.fleetId || fleet.id,
    trip_type: tripType,
    title: buildBookingTitle({ ...booking, mode: tripType, fleet }),
    pickup_label: String(booking.pickup || "").trim(),
    destination_label: String(booking.dropoff || booking.destination || "").trim(),
    fare_amount: null,
    fare_currency: "SLE",
    status: "requested",
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("transport_trips")
    .insert(payload)
    .select()
    .maybeSingle();

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
