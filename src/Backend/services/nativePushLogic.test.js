import assert from "node:assert/strict";
import test from "node:test";

import {
  ANDROID_PUSH_CHANNEL,
  ANDROID_PUSH_CHANNELS,
  HORN_PUSH_KINDS,
  decideFirstRunPush,
  bannerContextsForRoute,
  buildPushDiagnostic,
  classifyPushFailure,
  decideNativePushAction,
  diagnosticMessage,
  foregroundPushBanner,
  pushSoundForKind,
  isDuplicateTap,
  nativeErrorText,
  nativePushStatusFrom,
  normalizePushRoute,
  pushTapKey,
  pushTapRoute,
  refreshEventsForRoute,
  shouldSaveRefreshedToken,
  tokenSummary,
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

test("a refreshed token is saved only for this phone's own registration and only when it changed", () => {
  assert.equal(shouldSaveRefreshedToken({ state: savedState(), userId: USER, token: "new-device-token-value" }), true);
  assert.equal(shouldSaveRefreshedToken({ state: savedState(), userId: USER, token: "device-token-value" }), false);
  assert.equal(shouldSaveRefreshedToken({ state: savedState(OTHER), userId: USER, token: "new-device-token-value" }), false);
  assert.equal(shouldSaveRefreshedToken({ state: null, userId: USER, token: "new-device-token-value" }), false);
  assert.equal(shouldSaveRefreshedToken({ state: savedState(), userId: "", token: "new-device-token-value" }), false);
  assert.equal(shouldSaveRefreshedToken({ state: savedState(), userId: USER, token: "" }), false);
});

test("token log summaries never contain the token", () => {
  const token = "abcDEF123-secret-token-value";
  assert.equal(tokenSummary(token), `token(${token.length} chars)`);
  assert.ok(!tokenSummary(token).includes("abc"));
  assert.equal(tokenSummary(undefined), "token(0 chars)");
});

test("the Android push channel is high importance", () => {
  assert.equal(ANDROID_PUSH_CHANNEL.id, "kunthai_alerts");
  assert.equal(ANDROID_PUSH_CHANNEL.importance, 4);
});

test("every route a push carries opens a known screen; malformed ones fall back", () => {
  const opens = (route) => pushTapRoute(route).route;
  assert.equal(opens("conversation:abc"), "conversation:abc");
  assert.equal(opens("messages"), "messages");
  assert.equal(opens("notifications"), "notifications");
  assert.equal(opens("explore:notifications"), "notifications");
  assert.equal(opens("orders"), "orders");
  assert.equal(opens("urmall:messages"), "urmall:messages");
  assert.equal(opens("urmall:business-messages"), "urmall:business-messages");
  assert.equal(opens("urmall:business"), "urmall:business");
  assert.equal(opens("urride"), "urride");
  assert.equal(opens("urride:trip:123"), "urride:trip:123");
  assert.deepEqual(pushTapRoute("urmall:nowhere"), { route: "urmall", kind: "urmall", fallback: true, reason: "unknown UrMall screen" });
  assert.equal(opens("conversation:"), "messages");
  assert.equal(pushTapRoute("").fallback, true);
  assert.equal(opens(""), "notifications");
  assert.equal(opens(undefined), "notifications");
  assert.equal(opens("<script>"), "notifications");
  assert.equal(pushTapRoute("conversation:secret-id").kind, "conversation", "the logged kind has no id");
});

test("a tap is handled once, even when the OS delivers it again", () => {
  const recent = new Map();
  const ios = { notification: { id: "apns-request-1", data: { route: "orders" } } };
  const android = { notification: { id: "", data: { "google.message_id": "0:999", route: "urride" } } };
  assert.equal(pushTapKey(ios), "id:apns-request-1");
  assert.equal(pushTapKey(android), "id:0:999");
  assert.equal(pushTapKey({ notification: { data: { route: "urmall:business" } } }), "route:urmall:business");
  assert.equal(pushTapKey(null), "route:");
  assert.equal(isDuplicateTap(recent, pushTapKey(ios), 1_000), false);
  assert.equal(isDuplicateTap(recent, pushTapKey(ios), 2_000), true, "second delivery of the same tap");
  assert.equal(isDuplicateTap(recent, pushTapKey(android), 2_000), false, "another notification is not a duplicate");
  assert.equal(isDuplicateTap(recent, pushTapKey(ios), 40_000), false, "the same notification tapped again much later opens again");
});

test("each push kind gets its sound and an Android channel that exists", () => {
  const channels = new Map(ANDROID_PUSH_CHANNELS.map((channel) => [channel.id, channel]));
  assert.equal(channels.size, ANDROID_PUSH_CHANNELS.length);
  // The UrRide horn: new ride requests (operators) and "operator arrived" (passengers).
  assert.deepEqual(pushSoundForKind("urride_request"), { sound: "kt_horn.wav", channel: "kunthai_horn" });
  assert.deepEqual(pushSoundForKind("urride_arrival"), { sound: "kt_horn.wav", channel: "kunthai_horn" });
  assert.deepEqual([...HORN_PUSH_KINDS].sort(), ["urride_arrival", "urride_request"]);
  assert.equal(channels.get("kunthai_horn").importance, 5);
  assert.equal(pushSoundForKind("messages").sound, "kt_message.wav");
  assert.equal(pushSoundForKind("urmall_message").channel, "kunthai_messages");
  for (const kind of ["orders", "urmall_order", "urmall_booking", "urride_trip"]) {
    assert.equal(pushSoundForKind(kind).sound, "kt_order.wav", kind);
  }
  for (const kind of ["reactions", "urride_operator", "urride_company", "", undefined]) {
    assert.deepEqual(pushSoundForKind(kind), { sound: "default", channel: "kunthai_alerts" });
  }
  for (const kind of ["urride_request", "urride_arrival", "messages", "orders", "reactions"]) {
    const { sound, channel } = pushSoundForKind(kind);
    assert.ok(channels.has(channel), `${kind} channel missing`);
    if (sound !== "default") assert.equal(channels.get(channel).sound, sound);
  }
});

test("a new account gets push without finding the Settings switch, but a choice is respected", () => {
  // Never asked: ask once.
  assert.equal(decideFirstRunPush({ permission: "prompt", preference: "unset" }), "ask");
  assert.equal(decideFirstRunPush({ permission: "prompt-with-rationale", preference: "unset" }), "ask");
  assert.equal(decideFirstRunPush({ permission: "prompt", preference: "unset", asked: true }), "none");
  // Allowed at OS level but the account never chose: switch on quietly.
  assert.equal(decideFirstRunPush({ permission: "granted", preference: "unset" }), "enable");
  // Already on: the normal sync keeps it registered.
  assert.equal(decideFirstRunPush({ permission: "granted", preference: "on" }), "none");
  // The person turned it off, said no to the OS, or we cannot tell (offline).
  assert.equal(decideFirstRunPush({ permission: "prompt", preference: "off" }), "none");
  assert.equal(decideFirstRunPush({ permission: "granted", preference: "off" }), "none");
  assert.equal(decideFirstRunPush({ permission: "denied", preference: "unset" }), "none");
  assert.equal(decideFirstRunPush({ permission: "prompt", preference: "unknown" }), "none");
});

test("send-native-push maps every kind to the same sound and channel as the app", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../../../supabase/functions/send-native-push/index.ts", import.meta.url), "utf8");
  const block = (name) => source.slice(source.indexOf(`const ${name}`), source.indexOf("};", source.indexOf(`const ${name}`)));
  const sounds = Object.fromEntries(
    [...block("PUSH_SOUNDS").matchAll(/(\w+): \{ sound: "([^"]+)", androidSound: "([^"]+)", channel: "([^"]+)"/g)]
      .map(([, key, sound, androidSound, channel]) => [key, { sound, androidSound, channel }]),
  );
  const kinds = Object.fromEntries([...block("PUSH_SOUND_BY_KIND").matchAll(/(\w+): "(\w+)"/g)].map(([, kind, key]) => [kind, key]));
  assert.ok(Object.keys(kinds).length >= 8, "kind map parsed");
  for (const [kind, key] of Object.entries(kinds)) {
    const server = sounds[key];
    assert.ok(server, `${kind} -> ${key} exists on the server`);
    assert.deepEqual(pushSoundForKind(kind), { sound: server.sound, channel: server.channel }, kind);
    if (server.sound !== "default") assert.equal(server.androidSound, server.sound.replace(/\.wav$/, ""), kind);
  }
});

test("the horn ships for both platforms: under 30 s on iPhone, longer on Android", async () => {
  const { readFileSync } = await import("node:fs");
  const seconds = (path) => {
    const wav = readFileSync(new URL(path, import.meta.url));
    const byteRate = wav.readUInt32LE(28);
    const dataAt = wav.indexOf("data") + 4;
    return wav.readUInt32LE(dataAt) / byteRate;
  };
  const ios = seconds("../../../ios/App/App/kt_horn.wav");
  const android = seconds("../../../android/app/src/main/res/raw/kt_horn.wav");
  assert.ok(ios > 25 && ios < 30, `iOS horn ${ios}s (iOS plays custom push sounds up to 30 s)`);
  assert.ok(android > 30, `Android horn ${android}s`);
  const project = readFileSync(new URL("../../../ios/App/App.xcodeproj/project.pbxproj", import.meta.url), "utf8");
  assert.match(project, /kt_horn\.wav in Resources \*\/,/, "kt_horn.wav is bundled in the iOS app");
});
