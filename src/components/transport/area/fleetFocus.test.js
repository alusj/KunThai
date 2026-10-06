import assert from "node:assert/strict";
import test from "node:test";

import { countFleetAvailability, fleetFocusBounds, operatorsWithinFleetRadius } from "./fleetFocus.js";

const me = { lat: 8.48, lng: -13.23 };
// 0.01° latitude ≈ 1.1 km
const near = { id: "near", lat: 8.49, lng: -13.23, booked: false };
const mid = { id: "mid", lat: 8.58, lng: -13.23, booked: true }; // ~11 km
const far = { id: "far", lat: 8.7, lng: -13.23 }; // ~24 km

test("only operators within 15 km are kept, nearest first", () => {
  assert.deepEqual(operatorsWithinFleetRadius([far, mid, near], me).map((o) => o.id), ["near", "mid"]);
  assert.deepEqual(operatorsWithinFleetRadius([far], me), []);
  assert.deepEqual(operatorsWithinFleetRadius([near], null), []);
  assert.deepEqual(operatorsWithinFleetRadius([{ id: "x" }, near], me).map((o) => o.id), ["near"]);
});

test("bounds cover the passenger and the operators", () => {
  assert.deepEqual(fleetFocusBounds([near, mid], me), [[-13.23, 8.48], [-13.23, 8.58]]);
  assert.equal(fleetFocusBounds([], me), null);
});

test("availability counts booked and empty operators", () => {
  assert.deepEqual(countFleetAvailability([near, mid, { booked: false }]), { available: 2, booked: 1 });
});
