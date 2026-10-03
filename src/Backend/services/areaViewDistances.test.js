import assert from "node:assert/strict";
import test from "node:test";

import { placeDisplayLabel, withDistancesFrom } from "./locationSearchService.js";
import { getRoadDistancesFrom } from "./routeService.js";

test("a destination shows the place's name, not just its area", () => {
  assert.equal(placeDisplayLabel({ name: "Juba Hill", address: "Freetown, Western Area, Sierra Leone" }), "Juba Hill, Freetown");
  assert.equal(placeDisplayLabel({ name: "Juba Hill Road", address: "Juba Hill Road, Lumley, Freetown" }), "Juba Hill Road, Lumley, Freetown");
  assert.equal(placeDisplayLabel({ name: "Lumley", address: "Lumley, Freetown" }), "Lumley, Freetown");
  assert.equal(placeDisplayLabel({ name: "", address: "12 Main St, Accra" }), "12 Main St, Accra");
  assert.equal(placeDisplayLabel({ name: "Kissy Market" }), "Kissy Market");
  assert.equal(placeDisplayLabel(null), "");
});

test("search distances are measured from the person, not the map centre", () => {
  const person = { lat: 8.4844, lng: -13.2344 };
  const [place] = withDistancesFrom([{ id: "a", lat: 8.4844, lng: -13.2254, distance: "50 km away" }], person);
  assert.ok(place.distanceMeters > 900 && place.distanceMeters < 1100, `about 1 km, got ${place.distanceMeters}`);
  assert.match(place.distance, /^(9\d\d m|1\.0 km) away$/);
  assert.equal(place.distanceIsRoad, false);
  assert.deepEqual(withDistancesFrom([{ id: "b" }], null), [{ id: "b" }]);
});

test("road distances come from one OSRM table request, in order, with gaps as null", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ code: "Ok", distances: [[0, 6400, null]] }), { status: 200 });
  };
  try {
    const origin = { lat: 8.4844, lng: -13.2344 };
    const meters = await getRoadDistancesFrom(origin, [{ lat: 8.47, lng: -13.26 }, { lat: 8.46, lng: -13.27 }, { lat: Number.NaN, lng: 0 }]);
    assert.deepEqual(meters, [6400, null, null]);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/table\/v1\/driving\/-13\.2344,8\.4844;-13\.26,8\.47;-13\.27,8\.46\?sources=0&annotations=distance$/);

    // Cached: asking again does not hit the network for the known point.
    await getRoadDistancesFrom(origin, [{ lat: 8.47, lng: -13.26 }]);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a routing outage leaves the straight-line distance instead of failing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  try {
    assert.deepEqual(await getRoadDistancesFrom({ lat: 1, lng: 1 }, [{ lat: 2, lng: 2 }]), [null]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
