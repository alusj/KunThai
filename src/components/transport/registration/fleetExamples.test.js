import assert from "node:assert/strict";
import test from "node:test";

import { fleetExampleKey, fleetExampleKind } from "./fleetExamples.js";

test("fleet examples follow the chosen fleet type", () => {
  assert.equal(fleetExampleKind("Motorcycle", "Transport"), "bike");
  assert.equal(fleetExampleKind("Motorbike", "Delivery only"), "bike");
  assert.equal(fleetExampleKind("Tricycle", "Both"), "keke");
  assert.equal(fleetExampleKind("Car", "Transport"), "car");
  assert.equal(fleetExampleKind("Car", "Both"), "car");
  assert.equal(fleetExampleKind("Car", "Delivery"), "van");
  assert.equal(fleetExampleKind("Van", "Delivery only"), "van");
  assert.equal(fleetExampleKind("Taxi", "Ride only"), "car");
  assert.equal(fleetExampleKind("Vehicle / Car", "Rental"), "car");
  assert.equal(fleetExampleKind("", ""), "car");
});

test("example keys point at the fleet kind's field", () => {
  assert.equal(fleetExampleKey("model", "Motorcycle", "Transport"), "registrationExamples.urride.bike.model");
  assert.equal(fleetExampleKey("plate", "Van", "Delivery only"), "registrationExamples.urride.van.plate");
});
