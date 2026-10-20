import assert from "node:assert/strict";
import test from "node:test";

import {
  HEARTBEAT_INTERVAL_MS,
  MIN_MOVE_METERS,
  MIN_PUBLISH_INTERVAL_MS,
  NATIVE_DISTANCE_FILTER_METERS,
  NATIVE_HEARTBEAT_CHECK_MS,
  chooseLocationEngine,
  describeBackgroundAccess,
  distanceInMeters,
  nativeHeartbeatDue,
  needsBackgroundConsentSheet,
  presenceResumeAction,
  shouldPublishFix,
} from "./operatorLocationPolicy.js";

const FREETOWN = { lat: 8.484, lng: -13.234 };
// ~11 m and ~22 m north of FREETOWN (1e-4 deg latitude ≈ 11.1 m).
const NEAR = { lat: 8.4841, lng: -13.234 };
const FAR = { lat: 8.4842, lng: -13.234 };

test("throttle constants match the Phase 1 publisher and the 2-minute passenger window", () => {
  assert.equal(MIN_PUBLISH_INTERVAL_MS, 6000);
  assert.equal(MIN_MOVE_METERS, 12);
  assert.equal(HEARTBEAT_INTERVAL_MS, 30_000);
  assert.equal(NATIVE_DISTANCE_FILTER_METERS, 10);
  // Worst case between two heartbeats stays well inside 2 minutes.
  assert.ok(HEARTBEAT_INTERVAL_MS + NATIVE_HEARTBEAT_CHECK_MS < 120_000);
});

test("distanceInMeters", () => {
  assert.equal(distanceInMeters(null, FREETOWN), Infinity);
  assert.equal(Math.round(distanceInMeters(FREETOWN, FREETOWN)), 0);
  const near = distanceInMeters(FREETOWN, NEAR);
  assert.ok(near > 10 && near < 12, String(near));
});

test("shouldPublishFix: moving writes at most every 6 s unless 12 m moved", () => {
  const base = { lastPublishedAt: 100_000, lastPublishedPoint: FREETOWN };
  // No position at all: nothing to write.
  assert.equal(shouldPublishFix({ ...base, now: 200_000, point: null }), false);
  assert.equal(shouldPublishFix({ ...base, now: 200_000, point: null, force: true }), false);
  // 2 s later, 11 m away: skipped.
  assert.equal(shouldPublishFix({ ...base, now: 102_000, point: NEAR }), false);
  // 2 s later, 22 m away: written.
  assert.equal(shouldPublishFix({ ...base, now: 102_000, point: FAR }), true);
  // 6 s later, same spot: written.
  assert.equal(shouldPublishFix({ ...base, now: 106_000, point: FREETOWN }), true);
  assert.equal(shouldPublishFix({ ...base, now: 105_999, point: FREETOWN }), false);
  // Forced (heartbeat, booked state, foreground): always written.
  assert.equal(shouldPublishFix({ ...base, now: 100_500, point: FREETOWN, force: true }), true);
  // First fix ever.
  assert.equal(shouldPublishFix({ now: 1000, point: FREETOWN }), true);
});

test("nativeHeartbeatDue: re-sends the last fix after 30 s without a write", () => {
  assert.equal(nativeHeartbeatDue({ now: 129_999, lastPublishedAt: 100_000, hasPoint: true }), false);
  assert.equal(nativeHeartbeatDue({ now: 130_000, lastPublishedAt: 100_000, hasPoint: true }), true);
  // Never had a fix: nothing to send.
  assert.equal(nativeHeartbeatDue({ now: 999_999, lastPublishedAt: 0, hasPoint: false }), false);
  // A moving operator keeps writing, so the heartbeat stays quiet.
  assert.equal(nativeHeartbeatDue({ now: 106_000, lastPublishedAt: 100_000, hasPoint: true }), false);
});

test("chooseLocationEngine: native plugin in the app, web geolocation otherwise", () => {
  assert.equal(chooseLocationEngine({ isNative: true, pluginAvailable: true, hasWebGeolocation: true }), "native");
  // App build without the synced plugin keeps the old WebView path.
  assert.equal(chooseLocationEngine({ isNative: true, pluginAvailable: false, hasWebGeolocation: true }), "web");
  assert.equal(chooseLocationEngine({ isNative: false, pluginAvailable: true, hasWebGeolocation: true }), "web");
  assert.equal(chooseLocationEngine({ isNative: false, hasWebGeolocation: false }), "none");
  assert.equal(chooseLocationEngine(), "none");
});

test("describeBackgroundAccess", () => {
  assert.equal(describeBackgroundAccess({ platform: "ios", permissions: null }), "unknown");
  assert.equal(
    describeBackgroundAccess({ platform: "ios", permissions: { location: "granted", backgroundLocation: "granted" } }),
    "background",
  );
  assert.equal(
    describeBackgroundAccess({ platform: "ios", permissions: { location: "granted", backgroundLocation: "always" } }),
    "background",
  );
  assert.equal(
    describeBackgroundAccess({ platform: "ios", permissions: { location: "granted", backgroundLocation: "when_in_use" } }),
    "foregroundOnly",
  );
  assert.equal(describeBackgroundAccess({ platform: "ios", permissions: { location: "denied" } }), "denied");
  assert.equal(describeBackgroundAccess({ platform: "ios", permissions: { location: "prompt" } }), "prompt");
  // Android: the foreground service only needs the normal location permission,
  // even though ACCESS_BACKGROUND_LOCATION reads as not granted.
  assert.equal(
    describeBackgroundAccess({
      platform: "android",
      permissions: { location: "granted", backgroundLocation: "denied", notification: "granted" },
    }),
    "background",
  );
  assert.equal(describeBackgroundAccess({ platform: "android", permissions: { location: "denied" } }), "denied");
});

test("needsBackgroundConsentSheet: explain before prompting, never on the web or when nothing can be asked", () => {
  const prompt = { location: "prompt", backgroundLocation: "prompt" };
  assert.equal(needsBackgroundConsentSheet({ isNative: false, platform: "web", permissions: prompt }), false);
  assert.equal(needsBackgroundConsentSheet({ isNative: true, platform: "ios", permissions: prompt }), true);
  assert.equal(needsBackgroundConsentSheet({ isNative: true, platform: "ios", permissions: prompt, explainedBefore: true }), true);
  const whenInUse = { location: "granted", backgroundLocation: "when_in_use" };
  assert.equal(needsBackgroundConsentSheet({ isNative: true, platform: "ios", permissions: whenInUse }), true);
  assert.equal(
    needsBackgroundConsentSheet({ isNative: true, platform: "ios", permissions: whenInUse, explainedBefore: true }),
    false,
  );
  assert.equal(
    needsBackgroundConsentSheet({ isNative: true, platform: "ios", permissions: { location: "granted", backgroundLocation: "granted" } }),
    false,
  );
  assert.equal(needsBackgroundConsentSheet({ isNative: true, platform: "ios", permissions: { location: "denied" } }), false);
  assert.equal(needsBackgroundConsentSheet({ isNative: true, platform: "ios", permissions: null }), false);
  // Android: location fine, notification never asked → explain once.
  const noNotification = { location: "granted", backgroundLocation: "denied", notification: "prompt" };
  assert.equal(needsBackgroundConsentSheet({ isNative: true, platform: "android", permissions: noNotification }), true);
  assert.equal(
    needsBackgroundConsentSheet({ isNative: true, platform: "android", permissions: noNotification, explainedBefore: true }),
    false,
  );
  assert.equal(
    needsBackgroundConsentSheet({
      isNative: true,
      platform: "android",
      permissions: { location: "granted", notification: "granted" },
    }),
    false,
  );
  assert.equal(
    needsBackgroundConsentSheet({ isNative: true, platform: "android", permissions: { location: "prompt", notification: "prompt" } }),
    true,
  );
});

test("presenceResumeAction: resume only an online operator who allowed location before", () => {
  const online = { activeStatus: "active" };
  assert.equal(presenceResumeAction({ running: false, previouslyGranted: true, account: online }), "start");
  // Never prompts at launch.
  assert.equal(presenceResumeAction({ running: false, previouslyGranted: false, account: online }), "none");
  // Already sharing.
  assert.equal(presenceResumeAction({ running: true, previouslyGranted: true, account: online }), "none");
  // Switched off, or no operator account (signed out / passenger).
  assert.equal(presenceResumeAction({ running: false, previouslyGranted: true, account: { activeStatus: "offline" } }), "none");
  assert.equal(presenceResumeAction({ running: false, previouslyGranted: true, account: null }), "none");
});

test("a rough fix near a recent good one is noise and is not published", async () => {
  const { acceptFix } = await import("./operatorLocationPolicy.js");
  const good = { point: { lat: 8.4, lng: -13.2 }, accuracy: 12, at: 1_000 };
  // ~300 m away with 1389 m accuracy, 20 s after a 12 m GPS fix.
  assert.equal(acceptFix({ now: 21_000, point: { lat: 8.4027, lng: -13.2 }, accuracy: 1389, lastGood: good }), false);
  // Still held after five minutes parked (a 300 m cell fix indoors)...
  assert.equal(acceptFix({ now: 1_000 + 5 * 60_000, point: { lat: 8.4015, lng: -13.2 }, accuracy: 300, lastGood: good }), false);
  // ...and let through once the good one is older than ten minutes.
  assert.equal(acceptFix({ now: 1_000 + 10 * 60_000, point: { lat: 8.4027, lng: -13.2 }, accuracy: 1389, lastGood: good }), true);
  // A 120 m Wi-Fi fix just after a 12 m GPS fix, inside its own circle, is noise too.
  assert.equal(acceptFix({ now: 21_000, point: { lat: 8.4008, lng: -13.2 }, accuracy: 120, lastGood: good }), false);
  // A rough fix far outside its own error circle is a real move.
  assert.equal(acceptFix({ now: 21_000, point: { lat: 8.45, lng: -13.2 }, accuracy: 200, lastGood: good }), true);
  // Good or unknown accuracy always passes, as does a rough fix with no good one before it.
  assert.equal(acceptFix({ now: 21_000, point: { lat: 8.41, lng: -13.2 }, accuracy: 30, lastGood: good }), true);
  assert.equal(acceptFix({ now: 21_000, point: { lat: 8.41, lng: -13.2 }, accuracy: null, lastGood: good }), true);
  assert.equal(acceptFix({ now: 21_000, point: { lat: 8.41, lng: -13.2 }, accuracy: 1389, lastGood: null }), true);
});

test("a precise fix is requested while accuracy is poor, at most every 30 s", async () => {
  const { refineDue } = await import("./operatorLocationPolicy.js");
  assert.equal(refineDue({ now: 100_000, lastAccuracy: 1389, lastRefineAt: 0 }), true);
  assert.equal(refineDue({ now: 100_000, lastAccuracy: null, lastRefineAt: 0 }), true);
  assert.equal(refineDue({ now: 100_000, lastAccuracy: 15, lastRefineAt: 0 }), false);
  assert.equal(refineDue({ now: 100_000, lastAccuracy: 1389, lastRefineAt: 90_000 }), false);
  assert.equal(refineDue({ now: 100_000, lastAccuracy: 15, lastRefineAt: 99_000, force: true }), true);
});
