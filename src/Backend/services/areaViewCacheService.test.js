import assert from "node:assert/strict";
import test from "node:test";

import {
  cacheAreaViewData,
  cacheAreaViewPosition,
  readAreaViewCache,
} from "./areaViewCacheService.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("Area View restores a recent position and nearby map data", () => {
  globalThis.localStorage = createStorage();

  cacheAreaViewPosition({ lat: 8.484, lng: -13.234, accuracy: 12, heading: 90, speed: 2 });
  cacheAreaViewData({
    locations: [{ id: "location-1" }],
    operators: [{ id: "operator-1" }],
    reports: [{ id: "report-1" }],
    traffic: [{ id: "traffic-1" }],
    recentSearches: [{ id: "search-1" }],
    weather: { temperature: 28 },
  });

  const cache = readAreaViewCache();
  assert.deepEqual(cache.position, {
    lat: 8.484,
    lng: -13.234,
    accuracy: 12,
    heading: 90,
    speed: 2,
    label: "Cached current location",
  });
  assert.equal(cache.locations[0].id, "location-1");
  assert.equal(cache.operators[0].id, "operator-1");
  assert.equal(cache.reports[0].id, "report-1");
  assert.equal(cache.traffic[0].id, "traffic-1");
  assert.equal(cache.recentSearches[0].id, "search-1");
  assert.equal(cache.weather.temperature, 28);

  delete globalThis.localStorage;
});

test("Area View ignores stale position and live-area data", () => {
  globalThis.localStorage = createStorage();
  globalThis.localStorage.setItem("kunthai.areaView.cache.v2", JSON.stringify({
    position: { lat: 8.484, lng: -13.234 },
    positionSavedAt: 1,
    locations: [{ id: "stale-location" }],
    dataSavedAt: 1,
    recentSearches: [{ id: "safe-history" }],
  }));

  const cache = readAreaViewCache();
  assert.equal(cache.position, null);
  assert.deepEqual(cache.locations, []);
  assert.equal(cache.recentSearches[0].id, "safe-history");

  delete globalThis.localStorage;
});

test("Area View can restore recent offline data after the live freshness window", () => {
  globalThis.localStorage = createStorage();
  const savedAt = Date.now() - (10 * 60 * 1000);
  globalThis.localStorage.setItem("kunthai.areaView.cache.v2", JSON.stringify({
    position: { lat: 8.484, lng: -13.234 },
    positionSavedAt: savedAt,
    locations: [{ id: "offline-location" }],
    operators: [{ id: "offline-operator" }],
    dataSavedAt: savedAt,
  }));

  const cache = readAreaViewCache({ allowStale: true });
  assert.equal(cache.position.lat, 8.484);
  assert.equal(cache.locations[0].id, "offline-location");
  assert.equal(cache.operators[0].id, "offline-operator");
  assert.equal(cache.stale, true);

  delete globalThis.localStorage;
});
