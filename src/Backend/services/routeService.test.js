import assert from "node:assert/strict";
import test from "node:test";

import { getRouteBetweenPoints } from "./routeService.js";

test("routing reuses a cached route for the same nearby start and destination", async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };

  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return {
      ok: true,
      json: async () => ({
        geometry: {
          type: "LineString",
          coordinates: [[-13.2311, 8.4811], [-13.2255, 8.4899]],
        },
        distanceMeters: 1200,
        durationSeconds: 260,
      }),
    };
  };

  try {
    const start = { lat: 8.48111, lng: -13.23111 };
    const end = { lat: 8.48991, lng: -13.22551 };
    const first = await getRouteBetweenPoints(start, end);
    const second = await getRouteBetweenPoints(start, end);

    assert.equal(requests, 1);
    assert.deepEqual(second, first);
    assert.equal(JSON.parse(values.get("kunthai.areaView.routes.v1")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.localStorage;
  }
});
