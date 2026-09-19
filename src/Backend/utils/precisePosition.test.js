import assert from "node:assert/strict";
import test from "node:test";

import { getPreciseCurrentPosition } from "./precisePosition.js";

function fakeGeolocation(steps) {
  const state = { cleared: false };
  return {
    state,
    watchPosition(onSuccess, onError) {
      steps.forEach(({ at, accuracy, lat = 8.46, lng = -13.26, errorCode }) => {
        setTimeout(() => {
          if (state.cleared) return;
          if (errorCode) onError({ code: errorCode, message: "error" });
          else onSuccess({ coords: { latitude: lat, longitude: lng, accuracy } });
        }, at);
      });
      return 7;
    },
    clearWatch() {
      state.cleared = true;
    },
  };
}

test("returns as soon as a fix is precise enough, with its exact coordinates", async () => {
  const geolocation = fakeGeolocation([
    { at: 5, accuracy: 1414, lat: 8.5 },
    { at: 15, accuracy: 12, lat: 8.456789, lng: -13.268765 },
    { at: 40, accuracy: 5, lat: 9 },
  ]);
  const position = await getPreciseCurrentPosition({ geolocation, maxWaitMs: 500 });
  assert.equal(position.coords.accuracy, 12);
  assert.equal(position.coords.latitude, 8.456789);
  assert.equal(position.coords.longitude, -13.268765);
  assert.equal(geolocation.state.cleared, true);
});

test("keeps the most accurate fix when none reaches the target in time", async () => {
  const geolocation = fakeGeolocation([
    { at: 5, accuracy: 1414 },
    { at: 10, accuracy: 60, lat: 8.4571 },
    { at: 15, accuracy: 300 },
  ]);
  const position = await getPreciseCurrentPosition({ geolocation, maxWaitMs: 60 });
  assert.equal(position.coords.accuracy, 60);
  assert.equal(position.coords.latitude, 8.4571);
});

test("rejects immediately when permission is denied", async () => {
  const geolocation = fakeGeolocation([{ at: 5, errorCode: 1 }]);
  await assert.rejects(getPreciseCurrentPosition({ geolocation, maxWaitMs: 5000 }), (error) => error.code === 1);
});

test("rejects when the device never produces a fix", async () => {
  const geolocation = fakeGeolocation([{ at: 5, errorCode: 2 }]);
  await assert.rejects(getPreciseCurrentPosition({ geolocation, maxWaitMs: 50 }));
});
