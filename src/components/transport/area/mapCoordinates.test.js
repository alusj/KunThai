import assert from "node:assert/strict";
import test from "node:test";

import { boundsAroundPoints, toLngLatArray, toMapBounds, toMapPoint, withMapPoint } from "./mapCoordinates.js";

test("toMapPoint accepts the shapes the area data uses", () => {
  assert.deepEqual(toMapPoint({ lat: 8.48, lng: -13.23 }), { lat: 8.48, lng: -13.23 });
  assert.deepEqual(toMapPoint({ latitude: "8.48", longitude: "-13.23" }), { lat: 8.48, lng: -13.23 });
  assert.deepEqual(toMapPoint([-13.23, 8.48]), { lat: 8.48, lng: -13.23 });
});

test("toMapPoint rejects points MapLibre would throw on", () => {
  for (const value of [
    null,
    undefined,
    {},
    { lat: null, lng: null },
    { lat: "", lng: "" },
    { lat: "abc", lng: -13.2 },
    { lat: NaN, lng: 1 },
    { lat: 123.4, lng: -13.2 },
    { lat: -95, lng: 10 },
    { lat: 8, lng: 500 },
    { lat: Infinity, lng: 0 },
    [1],
    "8,-13",
  ]) {
    assert.equal(toMapPoint(value), null, JSON.stringify(value));
  }
});

test("withMapPoint keeps the other fields and fixes the numbers", () => {
  assert.deepEqual(withMapPoint({ id: "a", lat: "8.5", lng: "-13" }), { id: "a", lat: 8.5, lng: -13 });
  assert.equal(withMapPoint({ id: "b", lat: 200, lng: 0 }), null);
  assert.deepEqual(toLngLatArray({ lat: 1, lng: 2 }), [2, 1]);
});

test("bounds are built only from placeable points and never collapse", () => {
  assert.equal(boundsAroundPoints([]), null);
  assert.equal(boundsAroundPoints([{ lat: NaN, lng: 1 }]), null);
  const single = boundsAroundPoints([{ lat: 8, lng: -13 }, { lat: 300, lng: 0 }]);
  assert.ok(single[0][0] < single[1][0] && single[0][1] < single[1][1]);
  assert.deepEqual(boundsAroundPoints([{ lat: 8, lng: -13 }, { lat: 9, lng: -12 }]), [[-13, 8], [-12, 9]]);
  assert.equal(toMapBounds([[0, NaN], [1, 1]]), null);
  assert.equal(toMapBounds("x"), null);
  assert.deepEqual(toMapBounds([[-13, 8], [-12, 9]]), [[-13, 8], [-12, 9]]);
});
