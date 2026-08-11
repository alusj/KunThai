import test from "node:test";
import assert from "node:assert/strict";

import { resolveBookingLocationPreferences } from "./bookingLocationPreferences.js";

test("text-only saved pickup fills the next booking input", () => {
  const resolved = resolveBookingLocationPreferences({
    preferredPickupPlace: { id: "home", street: "26A Grassfield, Lumley" },
  });

  assert.equal(resolved.pickup, "26A Grassfield, Lumley");
  assert.equal(resolved.pickupPoint, null);
});

test("saved drop-off keeps its nested coordinates and fills its text", () => {
  const resolved = resolveBookingLocationPreferences({
    preferredDropoffPlace: {
      street: "Lumley Market",
      coordinates: { latitude: 8.48, longitude: -13.23 },
    },
  });

  assert.equal(resolved.dropoff, "Lumley Market");
  assert.equal(resolved.dropoffPoint.lat, 8.48);
  assert.equal(resolved.dropoffPoint.lng, -13.23);
});

test("an explicit booking pickup wins over the saved preference", () => {
  const resolved = resolveBookingLocationPreferences({
    target: { pickup: "Selected junction" },
    preferredPickupPlace: { street: "Saved home" },
  });

  assert.equal(resolved.pickup, "Selected junction");
  assert.equal(resolved.pickupPoint, null);
});
