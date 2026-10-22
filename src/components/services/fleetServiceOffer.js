// Whether a fleet takes rides and/or deliveries right now. The operator's trip
// controls (transport_fleets.accepts_ride / accepts_delivery, set on the
// dashboard) decide; the registration category (Transport / Delivery / Both)
// is only the fallback for a fleet whose controls are unknown. So an operator
// who registered for rides and later turns on "Accept deliveries" is listed
// under "Send a delivery", and one who turns off "Accept rides" leaves
// "Book a ride".
//
// The database twin is transport_open_booking_eligible_fleets (open and
// broadcast bookings), 20261021120000_urride_trip_controls_decide.sql.

function categoryOffers(category, service) {
  const value = String(category || "").toLowerCase();
  if (service === "ride") return ["transport", "both", "ride only", "ride and delivery"].includes(value);
  return ["delivery", "both", "delivery only", "ride and delivery"].includes(value);
}

// service: "ride" | "delivery"
export function fleetOffersService(fleet, service) {
  if (!fleet) return false;
  const control = service === "ride" ? fleet.acceptsRide : fleet.acceptsDelivery;
  if (typeof control === "boolean") return control;
  return categoryOffers(fleet.serviceCategory, service);
}

// The service a fleet card books when the passenger didn't pick one: a ride
// unless the fleet only takes deliveries.
export function defaultFleetService(fleet) {
  if (fleetOffersService(fleet, "ride")) return "ride";
  return fleetOffersService(fleet, "delivery") ? "delivery" : "ride";
}
