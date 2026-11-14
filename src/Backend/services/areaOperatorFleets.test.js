import assert from "node:assert/strict";
import test from "node:test";

import { applyOperatorFleets, groupFleetsByOperatorUser, mapTypeForFleetType, markerFanOffsets, fanOutOperatorPositions, metersPerPixel } from "./areaOperatorFleets.js";

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

test("a driver on a tricycle and a taxi shows both, the shared vehicle first", () => {
  const fleets = groupFleetsByOperatorUser([
    fleet("u1", { id: "trike", company_id: "tp", is_visible_to_passengers: true }),
    fleet("u1", { id: "taxi", fleet_type: "car", company_id: "tp", is_visible_to_passengers: true }),
  ]);
  const placed = applyOperatorFleets([operator("u1", { type: "car" })], fleets, "SL");
  assert.deepEqual(placed.map((item) => [item.id, item.type, item.fleetId]), [
    ["u1:taxi", "car", "taxi"],
    ["u1:trike", "keke", "trike"],
  ]);
  for (const item of placed) {
    assert.equal(item.operatorId, "u1");
    assert.equal(item.companyId, "tp");
  }
});

test("markers on the same spot fan out sideways; a marker on its own stays put", () => {
  const offsets = markerFanOffsets([
    { id: "u1:taxi", lat: 8.47101, lng: -13.27102 },
    { id: "u1:trike", lat: 8.47101, lng: -13.27102 },
    { id: "far", lat: 8.48, lng: -13.26 },
  ], { step: 60 });
  assert.deepEqual(offsets.get("u1:taxi"), [-30, 0]);
  assert.deepEqual(offsets.get("u1:trike"), [30, 0]);
  assert.deepEqual(offsets.get("far"), [0, 0]);
});

test("fleet types map onto map marker types", () => {
  assert.equal(mapTypeForFleetType("Motorcycle"), "bike");
  assert.equal(mapTypeForFleetType("tricycle"), "keke");
  assert.equal(mapTypeForFleetType("car"), "car");
  assert.equal(mapTypeForFleetType("truck"), "");
});

test("vehicles on one spot are moved apart on the map; ids and lone markers stay", () => {
  const moved = fanOutOperatorPositions([
    { id: "u1:taxi", lat: 8.47101, lng: -13.27102 },
    { id: "u1:trike", lat: 8.47101, lng: -13.27102 },
    { id: "far", lat: 8.48, lng: -13.26 },
  ], 50);
  assert.deepEqual(moved.map((item) => item.id), ["u1:taxi", "u1:trike", "far"]);
  const metres = (moved[1].lng - moved[0].lng) * 111_320 * Math.cos((8.47101 * Math.PI) / 180);
  assert.ok(Math.abs(metres - 50) < 0.5, `${metres} m apart`);
  assert.equal(moved[2].lng, -13.26);
  assert.ok(metersPerPixel(16, 8.47) > 1 && metersPerPixel(16, 8.47) < 1.5);
});
