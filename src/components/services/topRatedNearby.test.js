import assert from "node:assert/strict";
import test from "node:test";

import { applyFleetDistances, applyNearbyRanking, estimateTravelMinutes } from "./topRatedNearby.js";

test("travel time uses the vehicle's city speed plus a pickup buffer", () => {
  assert.equal(estimateTravelMinutes(5, "motorcycle"), 14); // 12 min + 2
  assert.equal(estimateTravelMinutes(0.2, "car"), 3);
  assert.equal(estimateTravelMinutes(0, "car"), 2);
  assert.equal(estimateTravelMinutes(3, "unknown"), 11);
  assert.equal(estimateTravelMinutes(null), null);
  assert.equal(estimateTravelMinutes(-1), null);
});

test("fleets follow the database order and split into rated and new", () => {
  const fleets = [
    { id: "a", fleetType: "motorcycle" },
    { id: "b", fleetType: "car" },
    { id: "c", fleetType: "car" },
  ];
  const rows = [
    { fleet_id: "b", distance_km: 2, location_source: "live", radius_km: 10, is_rated: true },
    { fleet_id: "a", distance_km: 1.2, location_source: "recent", radius_km: 10, is_rated: true },
    { fleet_id: "c", distance_km: 0.5, location_source: "live", radius_km: 10, is_rated: false },
    { fleet_id: "filtered-out", distance_km: 1, location_source: "live", radius_km: 10, is_rated: true },
  ];

  const { rated, fresh, radiusKm } = applyNearbyRanking(fleets, rows);
  assert.deepEqual(rated.map((fleet) => fleet.id), ["b", "a"]);
  assert.deepEqual(fresh.map((fleet) => fleet.id), ["c"]);
  assert.equal(radiusKm, 10);
  assert.equal(rated[0].etaMinutes, 8);
  assert.equal(rated[1].distanceSource, "recent");
  assert.equal(rated[1].etaMinutes, null, "no travel time from an old position");
});

test("no ranking rows means no nearby results", () => {
  assert.deepEqual(applyNearbyRanking([{ id: "a" }], []), { rated: [], fresh: [], radiusKm: null });
});

test("category lists put active fleets nearest first and keep offline last", () => {
  const fleets = [
    { id: "far", activeStatus: "active", fleetType: "motorcycle" },
    { id: "unknown", activeStatus: "active" },
    { id: "offline", activeStatus: "offline" },
    { id: "near", activeStatus: "active", fleetType: "car" },
  ];
  const rows = [
    { fleet_id: "far", distance_km: 4.2, location_source: "live" },
    { fleet_id: "near", distance_km: 0.8, location_source: "recent" },
    { fleet_id: "offline", distance_km: 0.1, location_source: "recent" },
  ];
  const ordered = applyFleetDistances(fleets, rows);
  assert.deepEqual(ordered.map((fleet) => fleet.id), ["near", "far", "unknown", "offline"]);
  assert.equal(ordered[0].etaMinutes, null, "no travel time from an earlier position");
  assert.equal(ordered[1].etaMinutes, 13);
  assert.equal(ordered[2].distanceSource, null, "no row means no distance shown");
});

test("without distances the original order is kept", () => {
  const fleets = [{ id: "a", activeStatus: "active" }, { id: "b", activeStatus: "active" }];
  assert.deepEqual(applyFleetDistances(fleets, []).map((fleet) => fleet.id), ["a", "b"]);
});
