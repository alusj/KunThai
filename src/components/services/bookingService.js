import supabase from "../../Backend/lib/supabaseClient";

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
