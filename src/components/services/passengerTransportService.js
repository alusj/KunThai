import supabase from "../../Backend/lib/supabaseClient";
import { fetchTransportFleetById } from "./transportFleetService";

const TRANSPORT_SAVED_PLACES_KEY = "kuntai.transport.savedPlaces";
const TRANSPORT_ACTIVE_PLACE_KEY = "kuntai.transport.activePlace";
const TRANSPORT_SETTINGS_KEY = "kuntai.transport.passengerSettings";

const pendingTripStatuses = ["pending_confirmation", "waiting_operator", "requested", "accepted", "arrived", "start_requested", "in_progress", "paused"];
const previousTripStatuses = ["completed", "cancelled"];

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

export function getActiveTrips() {
  return [];
}

export function getPassengerTrips() {
  return [];
}

export function getSavedOperators() {
  return [];
}

export function getTransportSavedPlaces() {
  const saved = readLocalJson(TRANSPORT_SAVED_PLACES_KEY, []);
  return Array.isArray(saved) ? saved : [];
}

export function getActiveTransportPlace() {
  return readLocalJson(TRANSPORT_ACTIVE_PLACE_KEY, null);
}

export function saveTransportSavedPlace(place) {
  const id = place.id || `local-place-${Date.now()}`;
  const savedPlace = {
    ...place,
    id,
    updatedAt: new Date().toISOString(),
  };
  const places = getTransportSavedPlaces();
  const nextPlaces = [savedPlace, ...places.filter((item) => item.id !== id)];
  writeLocalJson(TRANSPORT_SAVED_PLACES_KEY, nextPlaces);
  writeLocalJson(TRANSPORT_ACTIVE_PLACE_KEY, savedPlace);
  return savedPlace;
}

export function removeTransportSavedPlace(placeId) {
  const nextPlaces = getTransportSavedPlaces().filter((place) => place.id !== placeId);
  writeLocalJson(TRANSPORT_SAVED_PLACES_KEY, nextPlaces);

  const activePlace = getActiveTransportPlace();
  if (activePlace?.id === placeId) {
    writeLocalJson(TRANSPORT_ACTIVE_PLACE_KEY, nextPlaces[0] || null);
  }

  return nextPlaces;
}

export function selectTransportSavedPlace(place) {
  writeLocalJson(TRANSPORT_ACTIVE_PLACE_KEY, place || null);
  if (typeof window !== "undefined" && place) {
    window.dispatchEvent(new CustomEvent("transport-saved-place-selected", { detail: { place } }));
  }
  return place;
}

export function getTransportPassengerSettings() {
  return {
    tripAlerts: true,
    nearbyOperators: true,
    safetyReminders: true,
    savedPlaceSuggestions: true,
    language: "English",
    defaultRideType: "Any available",
    privacyMode: "Balanced",
    ...readLocalJson(TRANSPORT_SETTINGS_KEY, {}),
  };
}

export function saveTransportPassengerSettings(settings) {
  const nextSettings = {
    ...getTransportPassengerSettings(),
    ...settings,
    updatedAt: new Date().toISOString(),
  };
  writeLocalJson(TRANSPORT_SETTINGS_KEY, nextSettings);
  return nextSettings;
}

function formatFare(row) {
  if (!row?.fare_amount) return "Fare pending";
  return `${row.fare_currency || "SLE"} ${Number(row.fare_amount).toFixed(2)}`;
}

function formatTripStage(row) {
  if (row.eta_minutes) return `ETA ${row.eta_minutes} min`;
  if (row.status === "completed") return "Completed";
  if (row.status === "cancelled") return "Cancelled";
  if (row.status === "requested") return "Sent to operator";
  if (row.status === "accepted") return "Operator accepted";
  if (row.status === "arrived") return "Operator arrived";
  if (row.status === "start_requested") return "Confirm trip start";
  if (row.status === "pending_confirmation") return "Waiting for operator";
  if (row.status === "in_progress") return "Trip in progress";
  if (row.status === "paused") return "Trip paused";
  return row.status || "Active booking";
}

function getTripStep(status) {
  const steps = {
    requested: 1,
    pending_confirmation: 1,
    waiting_operator: 1,
    accepted: 2,
    arrived: 3,
    start_requested: 3,
    in_progress: 4,
    paused: 4,
    completed: 5,
    cancelled: 0,
  };

  return steps[status] ?? 1;
}

function formatStatusLabel(status) {
  return String(status || "pending")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getTripGroup(status) {
  return previousTripStatuses.includes(status) ? "previous" : "pending";
}

async function getCurrentPassengerId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || "";
}

async function mapTrip(row) {
  const tripType = row.trip_type || row.trip_mode;
  const fleet = row.fleet_id ? await fetchTransportFleetById(row.fleet_id) : null;
  return {
    id: row.id,
    mode: tripType === "delivery" ? "Delivery" : "Ride",
    title: row.title || (tripType === "delivery" ? "Delivery booking" : "Ride booking"),
    fleetId: row.fleet_id,
    status: formatStatusLabel(row.status),
    rawStatus: row.status || "",
    group: getTripGroup(row.status),
    stage: formatTripStage(row),
    pickup: row.pickup_label || "Pickup pending",
    destination: row.destination_label || "Destination pending",
    fare: formatFare(row),
    priority: ["pending_confirmation", "waiting_operator", "requested"].includes(row.status) ? "pending" : "live",
    step: getTripStep(row.status),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || row.created_at || "",
    bookingMethod: row.booking_method || "distance",
    estimatedDistanceKm: Number(row.estimated_distance_km || 0),
    bookedHours: Number(row.booked_hours || 0),
    baseFareSnapshot: Number(row.base_fare_snapshot || 0),
    rateSnapshot: Number(row.rate_snapshot || 0),
    fareAmount: Number(row.fare_amount || 0),
    distanceCoveredMeters: Number(row.distance_covered_meters || 0),
    startedAt: row.started_at || "",
    startRequestedAt: row.start_requested_at || "",
    pausedAt: row.paused_at || "",
    pausedSeconds: Number(row.paused_seconds || 0),
    lastLocationLatitude: row.last_location_latitude == null ? null : Number(row.last_location_latitude),
    lastLocationLongitude: row.last_location_longitude == null ? null : Number(row.last_location_longitude),
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
    .in("status", pendingTripStatuses)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return Promise.all((data || []).map(mapTrip));
}

export async function fetchPassengerTrips() {
  const passengerId = await getCurrentPassengerId();
  if (!passengerId) return [];

  const { data, error } = await supabase
    .from("transport_trips")
    .select("*")
    .eq("passenger_id", passengerId)
    .in("status", [...pendingTripStatuses, ...previousTripStatuses])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return Promise.all((data || []).map(mapTrip));
}

export function subscribePassengerTrips(onChange) {
  if (typeof onChange !== "function") return () => {};

  const channel = supabase
    .channel(`transport-passenger-trips-${Date.now()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "transport_trips" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
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
