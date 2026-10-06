import assert from "node:assert/strict";
import test from "node:test";

import { buildOperatorTrafficSignals, buildTrafficIntelligence, isSlowTrafficOperator } from "./trafficSignals.js";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const fresh = new Date(NOW - 30_000).toISOString();

function op(id, overrides = {}) {
  return { id, lat: 8.484, lng: -13.234, speedMps: 2, accuracyMeters: 10, lastSeenAt: fresh, status: "online", booked: false, ...overrides };
}

test("crawling operators with fresh, precise fixes count as slow traffic", () => {
  assert.equal(isSlowTrafficOperator(op("a"), NOW), true);
  assert.equal(isSlowTrafficOperator(op("fast", { speedMps: 9 }), NOW), false);
  assert.equal(isSlowTrafficOperator(op("stale", { lastSeenAt: new Date(NOW - 10 * 60_000).toISOString() }), NOW), false);
  assert.equal(isSlowTrafficOperator(op("blurry", { accuracyMeters: 250 }), NOW), false);
  assert.equal(isSlowTrafficOperator(op("nospeed", { speedMps: null }), NOW), false);
});

test("available operators parked at a stand are not a traffic jam", () => {
  assert.equal(isSlowTrafficOperator(op("parked", { speedMps: 0 }), NOW), false);
  const stand = [op("p1", { speedMps: 0 }), op("p2", { speedMps: 0.1 }), op("p3", { speedMps: 0 }), op("p4", { speedMps: 0 })];
  assert.deepEqual(buildOperatorTrafficSignals(stand, { now: NOW }), []);
});

test("an operator stopped while on a trip is held up", () => {
  assert.equal(isSlowTrafficOperator(op("trip", { speedMps: 0, booked: true }), NOW), true);
  assert.equal(isSlowTrafficOperator(op("busy", { speedMps: 0, status: "busy" }), NOW), true);
});

test("three or more slow operators close together form one signal", () => {
  const cluster = [op("a"), op("b", { lat: 8.4845 }), op("c", { lat: 8.4842 })];
  const signals = buildOperatorTrafficSignals(cluster, { now: NOW, message: (count) => `${count} slow` });
  assert.equal(signals.length, 1);
  assert.equal(signals[0].status, "yellow");
  assert.equal(signals[0].message, "3 slow");
  assert.ok(signals[0].confidenceScore <= 0.75);

  assert.deepEqual(buildOperatorTrafficSignals(cluster.slice(0, 2), { now: NOW }), [], "two vehicles are not enough");
});

test("intelligence merges snapshots, reports and operators, dropping expired items", () => {
  const signals = buildTrafficIntelligence({
    now: NOW,
    snapshots: [
      { id: "s1", status: "yellow", expiresAt: new Date(NOW + 60_000).toISOString() },
      { id: "s2", status: "red", expiresAt: new Date(NOW - 60_000).toISOString() },
    ],
    reports: [
      { id: "r1", type: "accident", severity: "high", lat: 8.5, lng: -13.2, verified: true },
      { id: "r2", type: "other", lat: 8.5, lng: -13.2 },
    ],
    operators: [],
  });
  assert.deepEqual(signals.map((signal) => signal.id), ["s1", "report-traffic-r1"]);
});
