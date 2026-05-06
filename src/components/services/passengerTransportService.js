import { getTransportFleetById } from "./transportFleetService";

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
