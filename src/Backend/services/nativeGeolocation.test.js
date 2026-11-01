import assert from "node:assert/strict";
import test from "node:test";

import { createNativeGeolocation } from "./nativeGeolocation.js";

const sample = { timestamp: 1700000000000, coords: { latitude: 8.484, longitude: -13.2299, accuracy: 5 } };

function fakePlugin(overrides = {}) {
  const cleared = [];
  let watchCallback = null;
  return {
    cleared,
    emit: (data, error) => watchCallback?.(data, error),
    getCurrentPosition: async () => sample,
    watchPosition: async (_options, callback) => {
      watchCallback = callback;
      return "native-1";
    },
    clearWatch: async ({ id }) => {
      cleared.push(id);
    },
    ...overrides,
  };
}

test("getCurrentPosition hands back a browser-shaped position", async () => {
  const geo = createNativeGeolocation(fakePlugin());
  const position = await new Promise((resolve, reject) => geo.getCurrentPosition(resolve, reject));
  assert.equal(position.coords.latitude, 8.484);
  assert.equal(position.coords.accuracy, 5);
  assert.equal(position.coords.speed, null);
  assert.equal(position.timestamp, sample.timestamp);
});

test("a native denial arrives as PERMISSION_DENIED (code 1)", async () => {
  const geo = createNativeGeolocation(fakePlugin({
    getCurrentPosition: async () => {
      throw Object.assign(new Error("Location permission was denied."), { code: "1" });
    },
  }));
  const error = await new Promise((resolve) => geo.getCurrentPosition(() => {}, resolve));
  assert.equal(error.code, 1);
  assert.equal(error.PERMISSION_DENIED, 1);
});

test("the timeout option fails with TIMEOUT (code 3)", async () => {
  const geo = createNativeGeolocation(fakePlugin({ getCurrentPosition: () => new Promise(() => {}) }));
  const error = await new Promise((resolve) => geo.getCurrentPosition(() => {}, resolve, { timeout: 5 }));
  assert.equal(error.code, 3);
});

test("watchPosition delivers updates until clearWatch, which stops the native watch", async () => {
  const plugin = fakePlugin();
  const geo = createNativeGeolocation(plugin);
  const seen = [];
  const id = geo.watchPosition((position) => seen.push(position.coords.latitude));
  await new Promise((resolve) => setTimeout(resolve, 0));
  plugin.emit(sample);
  geo.clearWatch(id);
  plugin.emit(sample);
  assert.deepEqual(seen, [8.484]);
  assert.deepEqual(plugin.cleared, ["native-1"]);
});

test("clearWatch before the native watch starts still stops it", async () => {
  const plugin = fakePlugin();
  const geo = createNativeGeolocation(plugin);
  geo.clearWatch(geo.watchPosition(() => {}));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(plugin.cleared, ["native-1"]);
});
