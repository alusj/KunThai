import assert from "node:assert/strict";
import test from "node:test";

import {
  bannerContextsForRoute,
  buildPushDiagnostic,
  classifyPushFailure,
  decideNativePushAction,
  diagnosticMessage,
  foregroundPushBanner,
  nativeErrorText,
  nativePushStatusFrom,
  normalizePushRoute,
  refreshEventsForRoute,
} from "./nativePushLogic.js";

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const NOW = Date.parse("2026-10-11T12:00:00Z");
const savedState = (userId = USER, hoursAgo = 1) => ({ platform: "ios", token: "device-token-value", userId, savedAt: new Date(NOW - hoursAgo * 3_600_000).toISOString() });

test("native registration errors are read from Errors, plugin payloads and strings", () => {
  assert.equal(nativeErrorText(new Error("  no valid  \"aps-environment\" entitlement  ")), "no valid \"aps-environment\" entitlement");
  assert.equal(nativeErrorText({ error: "Default FirebaseApp is not initialized" }), "Default FirebaseApp is not initialized");
  assert.equal(nativeErrorText("SERVICE_NOT_AVAILABLE"), "SERVICE_NOT_AVAILABLE");
  assert.equal(nativeErrorText(null), "");
  assert.ok(nativeErrorText("x".repeat(500)).length <= 160);
});

test("failures are classified into actionable reasons", () => {
  assert.equal(classifyPushFailure({ stage: "permission", platform: "ios" }), "permissionDenied");
  assert.equal(classifyPushFailure({ stage: "signin" }), "signIn");
  assert.equal(classifyPushFailure({ stage: "register", platform: "ios", message: "no valid \"aps-environment\" entitlement string found for application" }), "iosMissingEntitlement");
  assert.equal(classifyPushFailure({ stage: "register", platform: "ios", message: "remote notifications are not supported in the simulator" }), "iosSimulator");
  assert.equal(classifyPushFailure({ stage: "register", platform: "android", message: "Default FirebaseApp is not initialized in this process app.kunthai.mobile" }), "androidMissingFirebase");
  assert.equal(classifyPushFailure({ stage: "register", platform: "android", message: "java.io.IOException: SERVICE_NOT_AVAILABLE" }), "androidMissingFirebase");
  assert.equal(classifyPushFailure({ stage: "timeout", platform: "ios", message: "timeout" }), "timeout");
  assert.equal(classifyPushFailure({ stage: "save", platform: "ios", message: "JWT expired" }), "saveFailed");
  assert.equal(classifyPushFailure({ stage: "register", platform: "ios", message: "Something else" }), "registerFailed");
});

test("a diagnostic keeps stage, code, message, platform and time, never a token", () => {
  const diagnostic = buildPushDiagnostic({ stage: "register", error: { error: "no valid aps-environment entitlement", code: "UNIMPLEMENTED" }, platform: "ios", at: "2026-10-11T12:00:00.000Z" });
  assert.deepEqual(diagnostic, {
    stage: "register",
    code: "UNIMPLEMENTED",
    message: "no valid aps-environment entitlement",
    platform: "ios",
    reason: "iosMissingEntitlement",
    at: "2026-10-11T12:00:00.000Z",
  });
  assert.deepEqual(Object.keys(buildPushDiagnostic({ stage: "permission", error: null, platform: "android" })).sort(), ["at", "code", "message", "platform", "reason", "stage"]);
});

test("diagnostics map to the right message", () => {
  assert.equal(diagnosticMessage({ reason: "permissionDenied", platform: "ios" }).key, "permissionDeniedIos");
  assert.equal(diagnosticMessage({ reason: "permissionDenied", platform: "android" }).key, "permissionDeniedAndroid");
  assert.equal(diagnosticMessage({ reason: "iosMissingEntitlement" }).key, "iosMissingEntitlement");
  assert.equal(diagnosticMessage({ reason: "androidMissingFirebase" }).key, "androidMissingFirebase");
  assert.deepEqual(diagnosticMessage({ reason: "registerFailed", message: "APNs said no" }), { key: "registerFailedDetail", vars: { detail: "APNs said no" } });
  assert.equal(diagnosticMessage({ reason: "registerFailed", message: "" }).key, "registerFailed");
  assert.equal(diagnosticMessage({ stage: "timeout" }).key, "timeout");
});

test("when to register or unregister this phone", () => {
  const decide = (overrides) => decideNativePushAction({ userId: USER, permission: "granted", preferenceOn: true, state: savedState(), trigger: "startup", now: NOW, ...overrides });
  assert.equal(decide({ userId: "" }), "none", "signed out");
  assert.equal(decide({}), "register", "app start refreshes the token");
  assert.equal(decide({ state: null }), "register", "reinstall: push on for the account, no local state");
  assert.equal(decide({ state: savedState(OTHER) }), "register", "state from another account");
  assert.equal(decide({ state: null, preferenceOn: false }), "none", "push off for the account");
  assert.equal(decide({ preferenceOn: false }), "none", "push switched off elsewhere");
  assert.equal(decide({ state: null, preferenceOn: null }), "none", "preference unknown, nothing saved here");
  assert.equal(decide({ preferenceOn: null }), "register", "preference unknown, refresh the saved token");
  assert.equal(decide({ permission: "prompt", state: null }), "none", "never asks for permission by itself");
  assert.equal(decide({ permission: "denied" }), "unregister", "notifications turned off in system settings");
  assert.equal(decide({ permission: "denied", state: null }), "none", "denied and nothing saved");
  assert.equal(decide({ trigger: "resume" }), "none", "resume with a fresh token");
  assert.equal(decide({ trigger: "resume", state: savedState(USER, 13) }), "register", "resume with an old token");
  assert.equal(decide({ trigger: "resume", state: null }), "register", "permission granted again on resume");
  assert.equal(decide({ trigger: "resume", permission: "denied" }), "unregister", "permission revoked while away");
});

test("the Settings status reflects permission, this phone and the account", () => {
  assert.equal(nativePushStatusFrom({ permission: "denied", state: savedState(), userId: USER, preferenceOn: true }), "denied");
  assert.equal(nativePushStatusFrom({ permission: "granted", state: savedState(), userId: USER, preferenceOn: true }), "enabled");
  assert.equal(nativePushStatusFrom({ permission: "granted", state: savedState(), userId: USER, preferenceOn: null }), "enabled");
  assert.equal(nativePushStatusFrom({ permission: "granted", state: savedState(), userId: USER, preferenceOn: false }), "disabled");
  assert.equal(nativePushStatusFrom({ permission: "granted", state: savedState(OTHER), userId: USER, preferenceOn: true }), "disabled");
  assert.equal(nativePushStatusFrom({ permission: "prompt", state: null, userId: USER, preferenceOn: true }), "disabled");
});

test("web and native routes are normalized", () => {
  assert.equal(normalizePushRoute("platform:notifications"), "notifications");
  assert.equal(normalizePushRoute("explore:notifications"), "notifications");
  assert.equal(normalizePushRoute("marketplace:notifications"), "urmall");
  assert.equal(normalizePushRoute("transport:notifications"), "urride");
  assert.equal(normalizePushRoute(" conversation:abc "), "conversation:abc");
  assert.equal(normalizePushRoute(undefined), "");
});

test("a push in the foreground becomes a banner with its route", () => {
  assert.deepEqual(foregroundPushBanner({ title: "Amara", body: "Hello", data: { route: "conversation:c1", kind: "messages" } }), {
    title: "Amara", body: "Hello", route: "conversation:c1", kind: "messages", tone: "message", contextKey: "conversation:c1",
  });
  // iOS hands over the APNs payload.
  const ios = foregroundPushBanner({ data: { aps: { alert: { title: "Big news", body: "New look" } }, route: "notifications", kind: "announcement" } });
  assert.equal(ios.title, "Big news");
  assert.equal(ios.body, "New look");
  assert.equal(ios.route, "notifications");
  assert.equal(ios.tone, "activity");
  assert.equal(ios.contextKey, "native-push:notifications");
  assert.equal(foregroundPushBanner({ data: { aps: { alert: "Plain alert" } } }).body, "Plain alert");
  assert.equal(foregroundPushBanner({ body: "Only body", data: {} }).title, "KunThai");
  assert.equal(foregroundPushBanner({ data: { route: "orders" } }), null, "a silent push shows nothing");
  assert.equal(foregroundPushBanner(null), null);
});

test("duplicate banners and refresh events per route", () => {
  assert.deepEqual(bannerContextsForRoute("conversation:c1"), ["conversation:c1"]);
  assert.ok(bannerContextsForRoute("notifications").includes("explore-notification:"));
  assert.deepEqual(bannerContextsForRoute("orders"), ["marketplace:"]);
  assert.deepEqual(bannerContextsForRoute("urride"), ["transport:"]);
  assert.deepEqual(bannerContextsForRoute(""), []);
  assert.deepEqual(refreshEventsForRoute("conversation:c1"), ["kuntai-unified-notifications-updated", "explore-message-event"]);
  assert.deepEqual(refreshEventsForRoute("orders"), ["kuntai-unified-notifications-updated", "marketplace-orders-updated"]);
  assert.deepEqual(refreshEventsForRoute("notifications"), ["kuntai-unified-notifications-updated"]);
});
