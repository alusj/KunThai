import assert from "node:assert/strict";
import test from "node:test";

import {
  clearTransportDashboardSnapshots,
  readTransportDashboardSnapshot,
  writeTransportDashboardSnapshot,
} from "./transportDashboardCacheService.js";

function createStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    key(index) {
      return Array.from(values.keys())[index] || null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    values,
  };
}

function withWindow(run) {
  const previousWindow = globalThis.window;
  const localStorage = createStorage();
  globalThis.window = { localStorage };
  try {
    run(localStorage);
  } finally {
    globalThis.window = previousWindow;
  }
}

test("stores a bounded UrRide snapshot and restores it for the same account and country", () => {
  withWindow(() => {
    const scope = { userId: "passenger-1", countryIso: "SL" };
    const operators = Array.from({ length: 8 }, (_, index) => ({ id: `fleet-${index}` }));

    writeTransportDashboardSnapshot(scope, {
      summary: { topRatedCount: 8, activeTripsCount: 2, savedOperatorsCount: 3 },
      operators,
    });

    const restored = readTransportDashboardSnapshot(scope);
    assert.deepEqual(restored.summary, {
      topRatedCount: 8,
      activeTripsCount: 2,
      savedOperatorsCount: 3,
    });
    assert.equal(restored.operators.length, 6);
  });
});

test("does not expose one passenger snapshot to another passenger", () => {
  withWindow(() => {
    writeTransportDashboardSnapshot(
      { userId: "passenger-1", countryIso: "SL" },
      { summary: { activeTripsCount: 4 } },
    );

    assert.equal(
      readTransportDashboardSnapshot({ userId: "passenger-2", countryIso: "SL" }),
      null,
    );
  });
});

test("partial writes preserve the other cached dashboard section", () => {
  withWindow(() => {
    const scope = { userId: "passenger-1", countryIso: "SL" };
    writeTransportDashboardSnapshot(scope, {
      summary: { topRatedCount: 1, activeTripsCount: 0, savedOperatorsCount: 0 },
    });
    writeTransportDashboardSnapshot(scope, { operators: [{ id: "fleet-1" }] });

    const restored = readTransportDashboardSnapshot(scope);
    assert.equal(restored.summary.topRatedCount, 1);
    assert.equal(restored.operators[0].id, "fleet-1");
  });
});

test("clears every country snapshot for the selected account only", () => {
  withWindow(() => {
    writeTransportDashboardSnapshot(
      { userId: "passenger-1", countryIso: "SL" },
      { summary: { topRatedCount: 1 } },
    );
    writeTransportDashboardSnapshot(
      { userId: "passenger-1", countryIso: "GH" },
      { summary: { topRatedCount: 2 } },
    );
    writeTransportDashboardSnapshot(
      { userId: "passenger-2", countryIso: "SL" },
      { summary: { topRatedCount: 3 } },
    );

    clearTransportDashboardSnapshots("passenger-1");

    assert.equal(readTransportDashboardSnapshot({ userId: "passenger-1", countryIso: "SL" }), null);
    assert.equal(readTransportDashboardSnapshot({ userId: "passenger-1", countryIso: "GH" }), null);
    assert.equal(readTransportDashboardSnapshot({ userId: "passenger-2", countryIso: "SL" }).summary.topRatedCount, 3);
  });
});

