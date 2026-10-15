import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseDiscoveryMode,
  createRefreshScheduler,
  describeOperatorVisibility,
  formatDistanceKm,
  groupLiveDiscovery,
  hasUsablePosition,
  isLocationChangeNearby,
  isMissingRpcError,
  liveCardLabelValues,
  liveDiscoverySignature,
} from "./liveDiscovery.js";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const fleet = (id, extra = {}) => ({ id, fleetType: "Motorcycle", verificationStatus: "verified", activeStatus: "active", ...extra });
const row = (id, availability, distance, extra = {}) => ({
  fleet_id: id,
  availability,
  distance_km: distance,
  eta_minutes: 5,
  last_seen_at: new Date(NOW - 30_000).toISOString(),
  ...extra,
});

test("groups available and busy apart from recently online, nearest first", () => {
  const fleets = [fleet("a"), fleet("b"), fleet("c"), fleet("d")];
  const rows = [
    row("b", "busy", 2.0),
    row("a", "available", 1.2),
    row("d", "recent", 0.5, { last_seen_at: new Date(NOW - 7 * 60_000).toISOString() }),
    row("c", "available", 3.4),
  ];
  const groups = groupLiveDiscovery(fleets, rows, { now: NOW });
  assert.deepEqual(groups.available.map((item) => item.id), ["a", "b", "c"]);
  assert.deepEqual(groups.recent.map((item) => item.id), ["d"]);
  assert.equal(groups.available[1].liveAvailability, "busy");
  assert.equal(groups.recent[0].lastSeenMinutes, 7);
  assert.equal(groups.recent[0].etaMinutes, null, "no travel time from an old position");
  assert.equal(groups.available[0].distanceSource, "live");
});

test("skips rows without a hydrated fleet, duplicates and (by default) unverified fleets", () => {
  const fleets = [fleet("a"), fleet("n", { verificationStatus: "notVerified" }), fleet("p", { verificationStatus: "pending" }), fleet("r", { verificationStatus: "rejected" })];
  const rows = [row("a", "available", 1), row("a", "available", 1), row("ghost", "available", 1), row("n", "available", 1), row("p", "available", 1), row("r", "available", 1)];
  assert.deepEqual(groupLiveDiscovery(fleets, rows, { now: NOW }).available.map((item) => item.id), ["a", "p"]);
  assert.deepEqual(
    groupLiveDiscovery(fleets, rows, { now: NOW, includeUnverified: true }).available.map((item) => item.id).sort(),
    ["a", "n", "p", "r"],
  );
});

test("falls back to the app's travel estimate when the row has no ETA", () => {
  const groups = groupLiveDiscovery([fleet("a")], [row("a", "available", 2.5, { eta_minutes: null })], { now: NOW });
  assert.equal(groups.available[0].etaMinutes, 8); // ceil(2.5 / 25 * 60 + 2)
});

test("card labels: distance and ETA for live operators, last seen for recent ones", () => {
  assert.deepEqual(liveCardLabelValues({ liveAvailability: "available", distanceKm: 1.24, etaMinutes: 4 }), { kind: "distanceEta", distance: "1.2", eta: 4 });
  assert.deepEqual(liveCardLabelValues({ liveAvailability: "busy", distanceKm: 3, etaMinutes: 0 }), { kind: "distanceEta", distance: "3", eta: 1 });
  assert.deepEqual(liveCardLabelValues({ liveAvailability: "recent", lastSeenMinutes: 12 }), { kind: "lastSeen", minutes: 12 });
  assert.equal(liveCardLabelValues({ liveAvailability: "available", distanceKm: null }), null);
  assert.equal(liveCardLabelValues({ liveAvailability: "recent", lastSeenMinutes: null }), null);
  assert.equal(formatDistanceKm(0.04), "0");
  assert.equal(formatDistanceKm(undefined), "");
  assert.equal(formatDistanceKm(-1), "");
});

test("fallback decision: live only with a usable position and an existing RPC", () => {
  assert.equal(chooseDiscoveryMode({ position: { latitude: 8.48, longitude: -13.23 } }), "live");
  assert.equal(chooseDiscoveryMode({ position: { latitude: 8.48, longitude: -13.23 }, rpcAvailable: false }), "legacy");
  assert.equal(chooseDiscoveryMode({ position: null }), "legacy");
  assert.equal(chooseDiscoveryMode({ position: { latitude: null, longitude: null } }), "legacy");
  assert.equal(chooseDiscoveryMode({ position: { latitude: "", longitude: "" } }), "legacy");
  assert.equal(chooseDiscoveryMode({ position: { latitude: 95, longitude: 0 } }), "legacy");
  assert.equal(chooseDiscoveryMode(), "legacy");
  assert.equal(hasUsablePosition({ latitude: 0, longitude: 0 }), true);
});

test("recognises a missing RPC and nothing else", () => {
  assert.equal(isMissingRpcError({ code: "PGRST202", message: "Could not find the function" }), true);
  assert.equal(isMissingRpcError({ code: "42883", message: "function does not exist" }), true);
  assert.equal(isMissingRpcError({ status: 404, message: "Could not find the function public.x" }), true);
  assert.equal(isMissingRpcError({ code: "57014", message: "statement timeout" }), false);
  assert.equal(isMissingRpcError({ status: 500, message: "function failed" }), false);
  assert.equal(isMissingRpcError(null), false);
});

test("realtime changes only matter near the passenger", () => {
  const here = { latitude: 8.484, longitude: -13.234 };
  assert.equal(isLocationChangeNearby({ new: { lat: 8.494, lng: -13.234 } }, here, 15), true);
  assert.equal(isLocationChangeNearby({ new: { lat: 9.5, lng: -13.234 } }, here, 15), false);
  assert.equal(isLocationChangeNearby({ new: {}, old: { operator_id: "x" } }, here, 15), true, "a delete has no position");
  assert.equal(isLocationChangeNearby({ new: { lat: 9.5, lng: -13.2 } }, null, 15), false);
});

test("signature changes only when what the passenger sees changes", () => {
  const groups = groupLiveDiscovery([fleet("a")], [row("a", "available", 1.2)], { now: NOW });
  const same = groupLiveDiscovery([fleet("a")], [row("a", "available", 1.2)], { now: NOW + 1000 });
  const moved = groupLiveDiscovery([fleet("a")], [row("a", "available", 1.4)], { now: NOW });
  assert.equal(liveDiscoverySignature(groups), liveDiscoverySignature(same));
  assert.notEqual(liveDiscoverySignature(groups), liveDiscoverySignature(moved));
});

test("operator visibility: green under 2 minutes while sharing, amber otherwise", () => {
  assert.deepEqual(describeOperatorVisibility({ running: true, lastPublishedAt: NOW - 14_000, now: NOW }), { visible: true, seconds: 14 });
  assert.equal(describeOperatorVisibility({ running: true, lastPublishedAt: NOW - 120_000, now: NOW }).visible, false);
  assert.equal(describeOperatorVisibility({ running: false, lastPublishedAt: NOW - 1000, now: NOW }).visible, false);
  assert.equal(describeOperatorVisibility({ running: true, lastPublishedAt: 0, now: NOW }).visible, false);
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeTimers() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    pending: () => [...timers.values()],
    fire: async () => {
      const [[id, timer]] = [...timers.entries()];
      timers.delete(id);
      timer.fn();
      await tick();
    },
  };
}

test("refresh scheduler: interval while visible, no overlap, pauses when hidden", async () => {
  const timers = fakeTimers();
  let visible = true;
  let runs = 0;
  let release;
  const scheduler = createRefreshScheduler({
    run: () => {
      runs += 1;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    intervalMs: 10_000,
    isVisible: () => visible,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  scheduler.resume();
  await tick();
  assert.equal(runs, 1);
  // While the first run is in flight, extra requests fold into one follow-up.
  scheduler.requestNow();
  scheduler.requestNow();
  await tick();
  assert.equal(runs, 1);
  release();
  await tick();
  assert.equal(runs, 2, "one follow-up run for the requests made in flight");
  release();
  await tick();
  assert.equal(timers.pending().length, 1);
  assert.equal(timers.pending()[0].ms, 10_000);

  await timers.fire();
  await tick();
  assert.equal(runs, 3);
  release();
  await tick();

  visible = false;
  scheduler.pause();
  assert.equal(timers.pending().length, 0, "nothing scheduled while hidden");
  scheduler.requestNow();
  await tick();
  assert.equal(runs, 3, "no refresh while hidden");

  visible = true;
  scheduler.resume();
  await tick();
  assert.equal(runs, 4, "refreshes at once when back in view");
  release();
  await tick();

  scheduler.stop();
  assert.equal(timers.pending().length, 0);
  scheduler.requestNow();
  scheduler.resume();
  await tick();
  assert.equal(runs, 4, "nothing runs after stop");
});

test("refresh scheduler: requestNow respects the minimum gap and survives errors", async () => {
  const timers = fakeTimers();
  let clock = 0;
  let runs = 0;
  const scheduler = createRefreshScheduler({
    run: async () => {
      runs += 1;
      throw new Error("network");
    },
    minGapMs: 5000,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    now: () => clock,
  });
  await scheduler.requestNow();
  assert.equal(runs, 1);
  clock = 3000;
  await scheduler.requestNow();
  assert.equal(runs, 1, "inside the gap");
  clock = 6000;
  await scheduler.requestNow();
  assert.equal(runs, 2);
  scheduler.stop();
});
