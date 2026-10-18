import assert from "node:assert/strict";
import test from "node:test";

import { HEARTBEAT_INTERVAL_MS, NATIVE_HEARTBEAT_CHECK_MS } from "./operatorLocationPolicy.js";
import { createNativeLocationSession, nativeWatcherOptions, toWebPosition } from "./operatorNativeLocationSession.js";

function fakePlugin({ failStart = false } = {}) {
  const calls = [];
  let callback = null;
  return {
    calls,
    emit(location, error) {
      callback?.(location, error);
    },
    async requestPermissions(options) {
      calls.push(["requestPermissions", options]);
      return { location: "granted", notification: "granted" };
    },
    async stop() {
      calls.push(["stop"]);
    },
    async start(options, cb) {
      calls.push(["start", options]);
      if (failStart) throw new Error("UNIMPLEMENTED");
      callback = cb;
    },
  };
}

function fakeTimers() {
  const timers = new Map();
  let next = 1;
  return {
    timers,
    setIntervalFn: (fn, ms) => {
      const id = next++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearIntervalFn: (id) => timers.delete(id),
    tick() {
      for (const { fn } of [...timers.values()]) fn();
    },
  };
}

// A private queue per test so tests don't wait on each other.
function localQueue() {
  let chain = Promise.resolve();
  return (task) => {
    const run = chain.then(task, task);
    chain = run.catch(() => {});
    return run;
  };
}

const FIX = { latitude: 8.484, longitude: -13.234, accuracy: 9, bearing: 90, speed: 4, time: 1000 };

test("watcher options: translated notification, 25 m filter, prompts only when interactive", () => {
  const quiet = nativeWatcherOptions({ notificationTitle: "T", notificationMessage: "M" });
  assert.deepEqual(quiet, {
    backgroundTitle: "T",
    backgroundMessage: "M",
    requestPermissions: false,
    stale: false,
    distanceFilter: 10,
    networkFallback: true,
  });
  assert.equal(nativeWatcherOptions({ interactive: true }).requestPermissions, true);
});

test("toWebPosition maps the plugin fix to the shape publishRow reads", () => {
  assert.deepEqual(toWebPosition(FIX), {
    coords: { latitude: 8.484, longitude: -13.234, accuracy: 9, heading: 90, speed: 4 },
    timestamp: 1000,
  });
});

test("start stops any leftover watcher first, then forwards fixes", async () => {
  const plugin = fakePlugin();
  const timers = fakeTimers();
  const fixes = [];
  const session = createNativeLocationSession({
    plugin,
    platform: "ios",
    notificationTitle: "KunThai: you're online",
    notificationMessage: "msg",
    onLocation: (position) => fixes.push(position),
    queue: localQueue(),
    ...timers,
  });
  assert.equal(await session.started, true);
  assert.deepEqual(plugin.calls.map(([name]) => name), ["stop", "start"]);
  assert.equal(plugin.calls[1][1].requestPermissions, false);
  assert.equal(plugin.calls[1][1].backgroundTitle, "KunThai: you're online");

  plugin.emit(FIX);
  plugin.emit({ latitude: Number.NaN, longitude: 1 });
  plugin.emit(undefined);
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0].coords.latitude, 8.484);
});

test("interactive start on Android asks for location and notifications first", async () => {
  const plugin = fakePlugin();
  const session = createNativeLocationSession({
    plugin,
    platform: "android",
    interactive: true,
    queue: localQueue(),
    ...fakeTimers(),
  });
  await session.started;
  assert.deepEqual(plugin.calls[0], ["requestPermissions", { permissions: ["location", "notification"] }]);
  assert.equal(plugin.calls.at(-1)[0], "start");
  assert.equal(plugin.calls.at(-1)[1].requestPermissions, true);
});

test("non-interactive Android start never asks for permissions (no prompt at launch)", async () => {
  const plugin = fakePlugin();
  const session = createNativeLocationSession({ plugin, platform: "android", queue: localQueue(), ...fakeTimers() });
  await session.started;
  assert.equal(plugin.calls.some(([name]) => name === "requestPermissions"), false);
});

test("heartbeat re-sends the last fix after 30 s without a write, only with a fix", async () => {
  const timers = fakeTimers();
  let clock = 100_000;
  let lastPublishedAt = 100_000;
  let hasPoint = false;
  let beats = 0;
  const session = createNativeLocationSession({
    plugin: fakePlugin(),
    queue: localQueue(),
    now: () => clock,
    lastPublishedAt: () => lastPublishedAt,
    hasPoint: () => hasPoint,
    beat: () => {
      beats += 1;
      lastPublishedAt = clock;
    },
    ...timers,
  });
  await session.started;
  assert.equal([...timers.timers.values()][0].ms, NATIVE_HEARTBEAT_CHECK_MS);

  clock += HEARTBEAT_INTERVAL_MS;
  timers.tick();
  assert.equal(beats, 0, "no fix yet");

  hasPoint = true;
  clock += 10_000;
  timers.tick();
  assert.equal(beats, 1);
  clock += 10_000;
  timers.tick();
  assert.equal(beats, 1, "just published");
  clock += 20_000;
  timers.tick();
  assert.equal(beats, 2);
});

test("stop (Active off, sign out, account switch) clears the heartbeat and stops the native watcher", async () => {
  const plugin = fakePlugin();
  const timers = fakeTimers();
  const fixes = [];
  const session = createNativeLocationSession({
    plugin,
    queue: localQueue(),
    onLocation: (position) => fixes.push(position),
    ...timers,
  });
  await session.started;
  await session.stop();
  assert.equal(timers.timers.size, 0);
  assert.deepEqual(plugin.calls.map(([name]) => name), ["stop", "start", "stop"]);
  // A late fix after stopping is ignored.
  plugin.emit(FIX);
  assert.equal(fixes.length, 0);
  // Stopping twice is harmless.
  await session.stop();
  assert.equal(plugin.calls.length, 3);
});

test("stop while start is in flight still ends with the watcher stopped", async () => {
  const plugin = fakePlugin();
  const queue = localQueue();
  const session = createNativeLocationSession({ plugin, queue, ...fakeTimers() });
  const stopped = session.stop();
  await session.started;
  await stopped;
  // The start task saw the stop and never started; the final call is a stop.
  assert.equal(plugin.calls.some(([name]) => name === "start"), false);
  assert.equal(plugin.calls.at(-1)[0], "stop");
});

test("a failed start reports back (the service falls back to the web engine)", async () => {
  let failed = 0;
  const session = createNativeLocationSession({
    plugin: fakePlugin({ failStart: true }),
    queue: localQueue(),
    onStartFailed: () => {
      failed += 1;
    },
    ...fakeTimers(),
  });
  assert.equal(await session.started, false);
  assert.equal(failed, 1);
});

test("permission errors from the plugin are reported, other errors ignored", async () => {
  const plugin = fakePlugin();
  const errors = [];
  const session = createNativeLocationSession({
    plugin,
    queue: localQueue(),
    onPermissionError: (error) => errors.push(error.code),
    ...fakeTimers(),
  });
  await session.started;
  plugin.emit(undefined, { code: "NOT_AUTHORIZED" });
  plugin.emit(undefined, { code: "SOMETHING_ELSE" });
  assert.deepEqual(errors, ["NOT_AUTHORIZED"]);
});
