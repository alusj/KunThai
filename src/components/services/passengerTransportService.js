import supabase from "../../Backend/lib/supabaseClient";
import { fetchTransportFleetById } from "./transportFleetService";

export function getActiveTrips() {
  return [];
}

export function getSavedOperators() {
  return [];
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
  if (!passengerId) return [];

  const { data, error } = await supabase
    .from("transport_trips")
    .select("*")
    .eq("passenger_id", passengerId)
    .in("status", ["pending_confirmation", "waiting_operator", "requested", "accepted", "in_progress"])
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return Promise.all((data || []).map(mapTrip));
}

export async function fetchSavedOperators() {
  const passengerId = await getCurrentPassengerId();
  if (!passengerId) return [];

  const { data, error } = await supabase
    .from("transport_saved_operators")
    .select("*")
    .eq("passenger_id", passengerId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const savedRows = data || [];
  const fleets = await Promise.all(savedRows.map((row) => fetchTransportFleetById(row.fleet_id)));

  return savedRows.map((row, index) => {
    const fleet = fleets[index];

    return {
      id: row.id,
      fleetId: row.fleet_id,
      savedAs: row.saved_as || row.label || (fleet?.serviceCategory === "Delivery" ? "Saved delivery operator" : "Saved ride operator"),
      lastUsed: row.updated_at ? `Saved ${new Date(row.updated_at).toLocaleDateString()}` : "Saved operator",
      fleet,
    };
  }).filter((saved) => saved.fleet);
}
