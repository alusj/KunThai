import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeCoordinates,
  isValidCoordinates,
  fromGeoJSON,
  toGeoJSON,
  fromLatLngArray,
  toLatLng,
  isNullIsland,
} from "./coordinates.js";

// A real Freetown / Lumley point used across the suite.
const LUMLEY = { latitude: 8.484, longitude: -13.268 };

test("normalizes canonical object", () => {
  assert.deepEqual(normalizeCoordinates(LUMLEY), LUMLEY);
});

test("normalizes {lat,lng} and {lat,lon} shapes", () => {
  assert.deepEqual(normalizeCoordinates({ lat: 8.484, lng: -13.268 }), LUMLEY);
  assert.deepEqual(normalizeCoordinates({ lat: 8.484, lon: -13.268 }), LUMLEY);
});

test("accepts safe numeric strings", () => {
  assert.deepEqual(normalizeCoordinates({ latitude: "8.484", longitude: "-13.268" }), LUMLEY);
});

test("rejects null / undefined / empty / NaN", () => {
  assert.equal(normalizeCoordinates(null), null);
  assert.equal(normalizeCoordinates({ latitude: null, longitude: -13.268 }), null);
  assert.equal(normalizeCoordinates({ latitude: "", longitude: "" }), null);
  assert.equal(normalizeCoordinates({ latitude: "abc", longitude: -13.268 }), null);
});

test("rejects out-of-range latitude/longitude", () => {
  assert.equal(normalizeCoordinates({ latitude: 91, longitude: 0.5 }), null);
  assert.equal(normalizeCoordinates({ latitude: 8.4, longitude: 181 }), null);
});

test("rejects accidental 0,0 default (Null Island)", () => {
  assert.equal(isNullIsland(0, 0), true);
  assert.equal(normalizeCoordinates({ latitude: 0, longitude: 0 }), null);
});

test("bare arrays are ambiguous and rejected by normalizeCoordinates", () => {
  assert.equal(normalizeCoordinates([8.484, -13.268]), null);
});

test("GeoJSON stays [longitude, latitude] and converts correctly", () => {
  assert.deepEqual(fromGeoJSON([-13.268, 8.484]), LUMLEY);
  assert.deepEqual(toGeoJSON(LUMLEY), [-13.268, 8.484]);
});

test("explicit [latitude, longitude] array helper", () => {
  assert.deepEqual(fromLatLngArray([8.484, -13.268]), LUMLEY);
});

test("toLatLng returns legacy shape", () => {
  assert.deepEqual(toLatLng(LUMLEY), { lat: 8.484, lng: -13.268 });
});

test("reversed lat/lng is detectable: swapped Lumley lands out of Sierra Leone", () => {
  // Correct Lumley: lat 8.484, lng -13.268. Reversed puts lat at -13.268.
  const swapped = normalizeCoordinates({ latitude: -13.268, longitude: 8.484 });
  // Still a *valid range* coordinate (so range checks alone cannot catch it) but
  // it is nowhere near Sierra Leone — callers must guard with a plausibility /
  // country check, which the distance debug logging surfaces.
  assert.ok(swapped);
  assert.notDeepEqual(swapped, LUMLEY);
});

test("isValidCoordinates convenience", () => {
  assert.equal(isValidCoordinates(LUMLEY), true);
  assert.equal(isValidCoordinates({ latitude: 0, longitude: 0 }), false);
});
