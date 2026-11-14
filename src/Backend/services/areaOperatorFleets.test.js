import assert from "node:assert/strict";
import test from "node:test";

import { applyOperatorFleets, groupFleetsByOperatorUser, mapTypeForFleetType } from "./areaOperatorFleets.js";

const operator = (id, extra = {}) => ({ id, type: "bike", countryCode: "", lat: 8.48, lng: -13.23, ...extra });
const fleet = (userId, extra = {}) => ({
  id: `fleet-${userId}`,
  fleet_type: "tricycle",
  country_iso: "SL",
  active_status: "active",
  company_id: null,
  is_visible_to_passengers: false,
  transport_operators: { user_id: userId },
  ...extra,
});

test("a tricycle whose location row has no country shows on the map as a tricycle", () => {
  const fleets = groupFleetsByOperatorUser([fleet("u1")]);
  const placed = applyOperatorFleets([operator("u1")], fleets, "SL");
  assert.equal(placed.length, 1);
  assert.equal(placed[0].type, "keke");
  assert.equal(placed[0].countryCode, "SL");
});

test("a fleet in another country, inactive, or hidden by its company keeps the operator off the map", () => {
  const fleets = groupFleetsByOperatorUser([
    fleet("abroad", { country_iso: "GN" }),
    fleet("inactive", { active_status: "inactive" }),
    fleet("hidden", { company_id: "c1", is_visible_to_passengers: false }),
    fleet("shown", { company_id: "c1", is_visible_to_passengers: true }),
  ]);
  const placed = applyOperatorFleets(
    [operator("abroad", { countryCode: "SL" }), operator("inactive"), operator("hidden"), operator("shown")],
    fleets,
    "SL",
  );
  assert.deepEqual(placed.map((item) => item.id), ["shown"]);
});

test("without readable fleets the location row's own country still decides", () => {
  const placed = applyOperatorFleets([operator("a", { countryCode: "SL" }), operator("b", { countryCode: "GN" }), operator("c")], null, "SL");
  assert.deepEqual(placed.map((item) => item.id), ["a"]);
  const noFleet = applyOperatorFleets([operator("a", { countryCode: "SL" }), operator("c")], new Map(), "SL");
  assert.deepEqual(noFleet.map((item) => item.id), ["a"]);
});

test("with several fleets the one matching what is shared wins", () => {
  const fleets = groupFleetsByOperatorUser([fleet("u1", { id: "t" }), fleet("u1", { id: "m", fleet_type: "motorcycle" })]);
  assert.equal(applyOperatorFleets([operator("u1", { type: "bike" })], fleets, "SL")[0].fleetId, "m");
  assert.equal(applyOperatorFleets([operator("u1", { type: "car" })], fleets, "SL")[0].fleetId, "t");
});

test("fleet types map onto map marker types", () => {
  assert.equal(mapTypeForFleetType("Motorcycle"), "bike");
  assert.equal(mapTypeForFleetType("tricycle"), "keke");
  assert.equal(mapTypeForFleetType("car"), "car");
  assert.equal(mapTypeForFleetType("truck"), "");
});
