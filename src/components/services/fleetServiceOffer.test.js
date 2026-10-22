import assert from "node:assert/strict";
import test from "node:test";

import { defaultFleetService, fleetOffersService } from "./fleetServiceOffer.js";

test("trip controls decide, whatever was chosen at registration", () => {
  // Registered for rides, then: rides off, deliveries on.
  const switched = { serviceCategory: "Transport", acceptsRide: false, acceptsDelivery: true };
  assert.equal(fleetOffersService(switched, "ride"), false, "invisible under Book a ride");
  assert.equal(fleetOffersService(switched, "delivery"), true, "visible under Send a delivery");
  assert.equal(defaultFleetService(switched), "delivery");

  // Registered for both, deliveries switched off.
  const ridesOnly = { serviceCategory: "Both", acceptsRide: true, acceptsDelivery: false };
  assert.equal(fleetOffersService(ridesOnly, "delivery"), false);
  assert.equal(fleetOffersService(ridesOnly, "ride"), true);

  // Both switched off: in neither list.
  const paused = { serviceCategory: "Both", acceptsRide: false, acceptsDelivery: false };
  assert.equal(fleetOffersService(paused, "ride"), false);
  assert.equal(fleetOffersService(paused, "delivery"), false);
});

test("without known trip controls the registration category is used", () => {
  assert.equal(fleetOffersService({ serviceCategory: "Transport" }, "ride"), true);
  assert.equal(fleetOffersService({ serviceCategory: "Transport" }, "delivery"), false);
  assert.equal(fleetOffersService({ serviceCategory: "Delivery", acceptsRide: null }, "delivery"), true);
  assert.equal(fleetOffersService({ serviceCategory: "Delivery" }, "ride"), false);
  assert.equal(defaultFleetService({ serviceCategory: "Delivery" }), "delivery");
  assert.equal(fleetOffersService(null, "ride"), false);
});
