import assert from "node:assert/strict";
import { test } from "node:test";

import { haversineKm, formatDistanceKm, distanceBand, resolveDistanceLabel } from "./distance.js";

const LUMLEY = { latitude: 8.484, longitude: -13.268 };
// Juba, South Sudan — the coordinate wrongly saved for the seller in the report.
const JUBA = { latitude: 4.8459246, longitude: 31.5959173 };

test("identical coordinates return 0 and format as Nearby", () => {
  assert.equal(haversineKm(LUMLEY, LUMLEY), 0);
  assert.equal(formatDistanceKm(0), "Nearby");
});

test("nearby points (~150 m) return a fraction of a km / metres", () => {
  // ~0.0013 deg latitude ≈ 150 m north.
  const near = { latitude: LUMLEY.latitude + 0.00135, longitude: LUMLEY.longitude };
  const km = haversineKm(LUMLEY, near);
  assert.ok(km > 0.1 && km < 0.2, `expected ~0.15 km, got ${km}`);
  assert.match(formatDistanceKm(km), /^\d{3} m$/);
});

test("<100 m is Nearby", () => {
  const veryNear = { latitude: LUMLEY.latitude + 0.0005, longitude: LUMLEY.longitude }; // ~55 m
  assert.equal(formatDistanceKm(haversineKm(LUMLEY, veryNear)), "Nearby");
});

test("1–10 km uses one decimal place", () => {
  assert.equal(formatDistanceKm(3.14159), "3.1 km");
  assert.equal(distanceBand(3.1), "km-precise");
});

test("10 km and above are whole kilometres", () => {
  assert.equal(formatDistanceKm(4969.4), "4969 km");
  assert.equal(distanceBand(4969), "km-rounded");
});

test("the reported bug: Lumley -> Juba is ~4969 km (correct math, wrong data)", () => {
  const km = haversineKm(LUMLEY, JUBA);
  assert.ok(Math.round(km) >= 4900 && Math.round(km) <= 5050, `got ${km}`);
});

test("numeric-string coordinates still calculate", () => {
  const km = haversineKm({ latitude: "8.484", longitude: "-13.268" }, JUBA);
  assert.ok(km > 4900);
});

test("missing / null / invalid coordinates => null => Distance unavailable", () => {
  assert.equal(haversineKm(null, LUMLEY), null);
  assert.equal(haversineKm(LUMLEY, { latitude: 0, longitude: 0 }), null); // 0,0 default
  assert.equal(haversineKm(LUMLEY, { latitude: 91, longitude: 0 }), null); // out of range
  assert.equal(formatDistanceKm(null), "Distance unavailable");
});

test("reversed lat/lng produces a wrong distance, not zero (caught by plausibility)", () => {
  const reversed = { latitude: LUMLEY.longitude, longitude: LUMLEY.latitude };
  const km = haversineKm(LUMLEY, reversed);
  assert.ok(km > 1000, `reversed coord should be far, got ${km}`);
});

test("resolveDistanceLabel uses i18n keys via a fake t()", () => {
  const t = (key, vars) => `${key}:${vars ? JSON.stringify(vars) : ""}`;
  assert.equal(resolveDistanceLabel(LUMLEY, LUMLEY, t), "urmall.seller.nearby:");
  assert.equal(resolveDistanceLabel(LUMLEY, null, t), "urmall.seller.distanceUnavailable:");
  assert.equal(resolveDistanceLabel(LUMLEY, JUBA, t), 'urmall.seller.kmAway:{"value":4969}');
});
