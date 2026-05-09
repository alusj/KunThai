import supabase from "../../Backend/lib/supabaseClient";
import { fetchTransportFleetById, fetchTransportFleets, getTransportFleetById } from "./transportFleetService";

export const activeTrips = [
  {
    id: "trip-ride-alpha",
    mode: "Ride",
    title: "Ride to Lumley",
    fleetId: "fleet-alpha-taxi",
    status: "Operator arriving",
    stage: "ETA 3 min",
    pickup: "Current location",
    destination: "Lumley Beach Road",
    fare: "SLE 35",
    priority: "live",
  },
  {
    id: "trip-delivery-fast",
    mode: "Delivery",
    title: "Package to Central",
    fleetId: "fleet-fast-delivery-bike",
    status: "Pickup in progress",
    stage: "Rider is 5 min away",
    pickup: "Wilkinson Road",
    destination: "Central",
    fare: "SLE 22",
    priority: "live",
  },
  {
    id: "trip-pending-keke",
    mode: "Ride",
    title: "Tricycle booking",
    fleetId: "fleet-central-keke",
    status: "Pending confirmation",
    stage: "Waiting for operator",
    pickup: "Siaka Stevens Street",
    destination: "Market area",
    fare: "SLE 17",
    priority: "pending",
  },
];

export const savedOperators = [
  {
    id: "saved-alpha-taxi",
    fleetId: "fleet-alpha-taxi",
    savedAs: "Trusted taxi",
    lastUsed: "Used yesterday",
  },
  {
    id: "saved-easy-bike",
    fleetId: "fleet-easy-bike",
    savedAs: "Fast bike",
    lastUsed: "Used 3 days ago",
  },
  {
    id: "saved-central-keke",
    fleetId: "fleet-central-keke",
    savedAs: "Market tricycle",
    lastUsed: "Used last week",
  },
];

export function getActiveTrips() {
  return activeTrips.map((trip) => ({
    ...trip,
    fleet: getTransportFleetById(trip.fleetId),
  }));
}

export function getSavedOperators() {
  return savedOperators.map((saved) => ({
    ...saved,
    fleet: getTransportFleetById(saved.fleetId),
  }));
}

function formatFare(row) {
  if (!row?.fare_amount) return "Fare pending";
  return `${row.fare_currency || "SLE"} ${Number(row.fare_amount).toFixed(2)}`;
}

function formatTripStage(row) {
  if (row.eta_minutes) return `ETA ${row.eta_minutes} min`;
  if (row.status === "completed") return "Completed";
  if (row.status === "pending_confirmation") return "Waiting for operator";
  if (row.status === "in_progress") return "Trip in progress";
  return row.status || "Active booking";
}

async function getCurrentPassengerId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || "";
}

async function mapTrip(row) {
  const fleet = row.fleet_id ? await fetchTransportFleetById(row.fleet_id) : null;
  return {
    id: row.id,
    mode: row.trip_type === "delivery" ? "Delivery" : "Ride",
    title: row.title || (row.trip_type === "delivery" ? "Delivery booking" : "Ride booking"),
    fleetId: row.fleet_id,
    status: row.status || "Active",
    stage: formatTripStage(row),
    pickup: row.pickup_label || "Pickup pending",
    destination: row.destination_label || "Destination pending",
    fare: formatFare(row),
    priority: ["pending_confirmation", "waiting_operator", "requested"].includes(row.status) ? "pending" : "live",
    fleet,
  };
}

export async function fetchActiveTrips() {
  const passengerId = await getCurrentPassengerId();
  if (!passengerId) return getActiveTrips();

  const { data, error } = await supabase
    .from("transport_trips")
    .select("*")
    .eq("passenger_id", passengerId)
    .in("status", ["pending_confirmation", "waiting_operator", "requested", "accepted", "in_progress"])
    .order("created_at", { ascending: false });

  if (error || !data?.length) return getActiveTrips();
  return Promise.all(data.map(mapTrip));
}

export async function fetchSavedOperators() {
  const savedIds = JSON.parse(localStorage.getItem("kuntai.transport.savedFleetIds") || "[]");
  const ids = Array.isArray(savedIds) ? savedIds : [];

  if (ids.length) {
    const fleets = await Promise.all(ids.map((id) => fetchTransportFleetById(id)));
    return fleets.filter(Boolean).map((fleet) => ({
      id: `saved-${fleet.id}`,
      fleetId: fleet.id,
      savedAs: fleet.serviceCategory === "Delivery" ? "Saved delivery operator" : "Saved ride operator",
      lastUsed: fleet.lastActive || "Saved operator",
      fleet,
    }));
  }

  const liveFleets = await fetchTransportFleets({ mode: "topRated", fleetType: null });
  return liveFleets.slice(0, 4).map((fleet) => ({
    id: `suggested-saved-${fleet.id}`,
    fleetId: fleet.id,
    savedAs: fleet.rating ? "Trusted by passengers" : "Available operator",
    lastUsed: fleet.lastActive || "Available now",
    fleet,
  }));
}
