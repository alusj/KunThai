// Push client for both worlds, and routing of notification taps back into
// the app.
//
// Browser (Web Push): background push works on Android/desktop Chromium and
// Firefox from the browser tab; on iPhone only after adding KunThai to the
// home screen (iOS 16.4+ installed PWA). It carries KunThai announcements
// (admin campaigns, supabase/functions/send-notification-push).
//
// iOS / Android app (@capacitor/push-notifications): the device's APNs or FCM
// token is saved with register_push_device_token() into push_device_tokens.
// Database triggers queue pushes for messages, comments, mentions, follows,
// reactions, order updates and admin campaigns with the push channel in
// push_outbox, and supabase/functions/send-native-push delivers them
// (supabase/migrations/20261011100000_native_push_delivery.sql). Pure
// decisions (failure reasons, when to register, foreground banners) live in
// nativePushLogic.js. Each push carries a
// "route" (e.g. "conversation:<id>", "notifications", "orders") that opens
// the matching screen when tapped.
//
// Both only send to accounts whose user_notification_preferences.push_enabled
// is true; the Settings switch moves it together with this device.

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import supabase from "../lib/supabaseClient";
import { t as i18nText } from "../../i18n/index";
import { App as CapacitorApp } from "@capacitor/app";
import {
  requestExploreScreen,
  requestMarketplaceScreen,
  runNotificationAction,
  showNotificationBanner,
  wasBannerShownRecently,
} from "./notificationBannerService";
import { requestConversationOpen } from "./explore/messageService";
import {
  ANDROID_PUSH_CHANNELS,
  HORN_PUSH_KINDS,
  NATIVE_PUSH_DIAGNOSTIC_KEY,
  NATIVE_PUSH_RECEIVED_EVENT,
  bannerContextsForRoute,
  buildPushDiagnostic,
  decideFirstRunPush,
  decideNativePushAction,
  diagnosticMessage,
  foregroundPushBanner,
  isDuplicateTap,
  nativePushStatusFrom,
  normalizePushRoute,
  pushTapKey,
  pushTapRoute,
  refreshEventsForRoute,
  shouldSaveRefreshedToken,
  tokenSummary,
} from "./nativePushLogic";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// Web Push does not work inside the app's WebView; the app uses native push.
function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function isPushSupported() {
  return !isNativeApp()
    && typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
    && Boolean(VAPID_PUBLIC_KEY);
}

// Opens the screen for a push route. Never reloads the page except for a web
// push that carries only a URL.
function navigateToTarget(target = "", url = "") {
  {
    const [kind, id] = normalizePushRoute(target).split(":");
    if (kind === "conversation" && id) {
      requestConversationOpen(id);
      requestExploreScreen("Messages");
      return;
    }
    if (kind === "messages") {
      requestExploreScreen("Messages");
      return;
    }
    if (kind === "notifications") {
      requestExploreScreen("Notifications");
      return;
    }
    if (kind === "urmall") {
      const screen = id === "messages" || id === "orders" || id === "business-messages" || id === "business"
        ? id
        : id === "admin-roles" ? "admin-roles" : "";
      requestMarketplaceScreen(screen);
      return;
    }
    if (kind === "urride") {
      window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "transport", target } }));
      return;
    }
    if (kind === "orders") {
      requestMarketplaceScreen("orders");
      return;
    }
    if (url && url !== "/" && url !== window.location.href) {
      window.location.assign(url);
    }
  }
}

// In-app banners: only while online (the screens they open need data).
function handleNotificationTarget(target = "", url = "") {
  runNotificationAction(() => navigateToTarget(target, url));
}

// --- Notification taps ------------------------------------------------------------
// A tap can arrive before the app can navigate: on a cold start Capacitor hands
// it over as soon as the listener is added (before React has mounted), and a
// signed-out person must sign in first. The tap waits here until App reports
// the main screens are ready (setNotificationNavigationReady), then opens
// exactly once. Logs carry the route kind only (no ids, text or tokens).
let navigationReady = false;
let pendingTap = null;
const recentTaps = new Map();

function queueNotificationTap({ route = "", url = "", key = "", source = "native" } = {}) {
  if (key && isDuplicateTap(recentTaps, key)) {
    pushLog(`tap ignored (${source}): already handled`);
    return;
  }
  const parsed = pushTapRoute(route);
  pushLog(`tap received (${source}): route=${parsed.kind}${parsed.fallback ? ` -> fallback (${parsed.reason})` : ""}`);
  pendingTap = { route: parsed.route, kind: parsed.kind, url: route ? "" : url, receivedAt: Date.now() };
  if (!navigationReady) {
    pushLog("tap waiting until KunThai is signed in and ready");
    return;
  }
  flushNotificationTap();
}

function flushNotificationTap() {
  if (!pendingTap || !navigationReady) return;
  const tap = pendingTap;
  pendingTap = null;
  try {
    navigateToTarget(tap.route, tap.url);
    pushLog(`tap opened ${tap.kind} after ${Date.now() - tap.receivedAt} ms`);
  } catch (error) {
    pushLog(`tap navigation failed for ${tap.kind}: ${error?.name || "error"}`);
  }
}

// App: true once the signed-in main screens are rendered (false on the
// loading, sign-in, two-step, onboarding and blocked screens).
export function setNotificationNavigationReady(ready) {
  const next = Boolean(ready);
  if (next === navigationReady) return;
  navigationReady = next;
  if (next && pendingTap) {
    pushLog("navigation ready; opening the tapped notification");
    flushNotificationTap();
  }
}

const WEB_PUSH_TARGET_PARAM = "kt_push";

// A web push clicked while no KunThai tab was open opens /?kt_push=<target>.
function takeWebPushTargetFromUrl() {
  try {
    const url = new URL(window.location.href);
    const target = url.searchParams.get(WEB_PUSH_TARGET_PARAM);
    if (!target) return;
    url.searchParams.delete(WEB_PUSH_TARGET_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    queueNotificationTap({ route: target, key: `web:${target}`, source: "web, new window" });
  } catch {
    // A malformed URL: nothing to open.
  }
}

export function registerKunThaiServiceWorker() {
  if (typeof window === "undefined") return;
  if (!isNativeApp()) takeWebPushTargetFromUrl();
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      if (import.meta.env.DEV) console.warn("[KunThai] service worker registration failed", error);
    });
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "kunthai-notification-click") {
      if (event.data.target) queueNotificationTap({ route: event.data.target, source: "web" });
      else handleNotificationTarget("", event.data.url);
    }
  });
}

// --- Native push (iOS / Android app) -----------------------------------------

const NATIVE_PUSH_KEY = "kunthai.nativePush";
const NATIVE_REGISTER_TIMEOUT_MS = 20_000;
const FOREGROUND_BANNER_DELAY_MS = 1500;

// One-line, string-only log for Logcat / Xcode (debug builds pipe the WebView
// console there as Capacitor/Console). Never pass a token, key or session.
function pushLog(message) {
  console.info(`[KunThai push] ${message}`);
}

function readNativePushState() {
  try {
    const value = JSON.parse(localStorage.getItem(NATIVE_PUSH_KEY) || "null");
    return value && typeof value === "object" && value.token ? value : null;
  } catch {
    return null;
  }
}

function writeNativePushState(value) {
  try {
    if (value) localStorage.setItem(NATIVE_PUSH_KEY, JSON.stringify(value));
    else localStorage.removeItem(NATIVE_PUSH_KEY);
  } catch {
    // Storage unavailable: the server copy of the token still works.
  }
}

// The last reason this phone could not be set up for push (no token in it).
function readPushDiagnostic() {
  try {
    const value = JSON.parse(localStorage.getItem(NATIVE_PUSH_DIAGNOSTIC_KEY) || "null");
    return value && typeof value === "object" && value.stage ? value : null;
  } catch {
    return null;
  }
}

function writePushDiagnostic(value) {
  try {
    if (value) localStorage.setItem(NATIVE_PUSH_DIAGNOSTIC_KEY, JSON.stringify(value));
    else localStorage.removeItem(NATIVE_PUSH_DIAGNOSTIC_KEY);
  } catch {
    // Storage unavailable: the message is still shown for this attempt.
  }
}

function pushProblemText(diagnostic) {
  const { key, vars } = diagnosticMessage(diagnostic);
  return i18nText(`nativePushFix.${key}`, vars);
}

// Records what went wrong and returns an Error whose message tells the person
// what to do about it.
function nativePushFailure(stage, error, platform) {
  const diagnostic = buildPushDiagnostic({ stage, error, platform });
  writePushDiagnostic(diagnostic);
  pushLog(`setup failed: stage=${diagnostic.stage} reason=${diagnostic.reason}${diagnostic.code ? ` code=${diagnostic.code}` : ""}${diagnostic.message ? ` detail=${diagnostic.message}` : ""}`);
  const failure = new Error(pushProblemText(diagnostic));
  failure.diagnostic = diagnostic;
  return failure;
}

function nativePlatform() {
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android" ? platform : "";
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || "";
  } catch {
    return "";
  }
}

async function nativePermission() {
  try {
    const result = await PushNotifications.checkPermissions();
    return String(result?.receive || "prompt");
  } catch {
    return "prompt";
  }
}

// The account's push switch (user_notification_preferences.push_enabled):
// true / false, or null when it could not be read (offline).
async function accountPushPreference(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from("user_notification_preferences")
      .select("push_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return data?.push_enabled === true;
  } catch {
    return null;
  }
}

// The account's push switch as "on" | "off" | "unset" (never chosen) |
// "unknown" (could not be read).
async function accountPushPreferenceState(userId) {
  if (!userId) return "unknown";
  try {
    const { data, error } = await supabase
      .from("user_notification_preferences")
      .select("push_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return "unknown";
    if (!data || data.push_enabled === null || data.push_enabled === undefined) return "unset";
    return data.push_enabled === true ? "on" : "off";
  } catch {
    return "unknown";
  }
}

const FIRST_RUN_PUSH_KEY = "kunthai.pushFirstRunAsked.v1";

function firstRunAsked(userId) {
  try {
    return (JSON.parse(localStorage.getItem(FIRST_RUN_PUSH_KEY) || "[]") || []).includes(userId);
  } catch {
    return false;
  }
}

function rememberFirstRunAsked(userId) {
  try {
    const asked = JSON.parse(localStorage.getItem(FIRST_RUN_PUSH_KEY) || "[]") || [];
    if (!asked.includes(userId)) localStorage.setItem(FIRST_RUN_PUSH_KEY, JSON.stringify([...asked, userId].slice(-20)));
  } catch {
    // Storage unavailable: at worst the question is asked again next launch.
  }
}

let firstRunPushStarted = false;

// Once the signed-in person is on the main screens (never during sign-up or
// onboarding), set push up for them: ask for the OS permission the first
// time, or switch it on quietly when the phone already allows it. A person
// who turned push off is never asked again. Push stays manageable in Settings.
export async function ensurePushOnFirstRun() {
  if (!isNativeApp() || firstRunPushStarted) return;
  firstRunPushStarted = true;
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const permission = await nativePermission();
    const preference = await accountPushPreferenceState(userId);
    const decision = decideFirstRunPush({ permission, preference, asked: firstRunAsked(userId) });
    pushLog(`first run: permission=${permission} accountPush=${preference} -> ${decision}`);
    if (decision === "none") return;
    if (decision === "ask") rememberFirstRunAsked(userId);
    let result = "";
    try {
      result = await enableNativePush();
    } catch {
      // The reason is already saved for Settings (nativePushFailure).
      return;
    }
    if (result === "enabled") {
      // Same row the Settings switch writes (delivery checks push_enabled).
      const { error } = await supabase
        .from("user_notification_preferences")
        .upsert({ user_id: userId, push_enabled: true, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      pushLog(error ? "first run: could not save the account's push switch" : "first run: push switched on for the account");
    }
  } catch {
    // Best-effort; Settings still offers the switch.
  } finally {
    firstRunPushStarted = false;
  }
}

// Asks iOS / Android for this device's push token. Rejects with the stage
// ("register" or "timeout") and the native reason, e.g. a build without the
// aps-environment entitlement or without google-services.json.
function obtainNativeToken() {
  return new Promise((resolve, reject) => {
    let settled = false;
    let handles = [];
    let timer = 0;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handles.forEach((handle) => handle?.remove?.());
      callback(value);
    };
    const fail = (stage) => (error) => finish(reject, { stage, error });
    timer = setTimeout(() => fail("timeout")(new Error("timeout")), NATIVE_REGISTER_TIMEOUT_MS);

    Promise.all([
      PushNotifications.addListener("registration", (token) => {
        if (token?.value) finish(resolve, token.value);
        else fail("register")(new Error("empty token"));
      }),
      PushNotifications.addListener("registrationError", fail("register")),
    ])
      .then((added) => {
        if (settled) {
          added.forEach((handle) => handle?.remove?.());
          return undefined;
        }
        handles = added;
        return PushNotifications.register();
      })
      .catch(fail("register"));
  });
}

async function saveNativeToken(token, platform) {
  const { error } = await supabase.rpc("register_push_device_token", { p_token: token, p_platform: platform });
  if (error) throw error;
}

let registrationInFlight = null;

// Gets this phone's token and saves it for the account. One registration at a
// time: callers arriving meanwhile share the running one.
function registerThisDevice(userId, platform) {
  if (registrationInFlight) return registrationInFlight;
  registrationInFlight = (async () => {
    let token = "";
    pushLog(`registering with ${platform === "ios" ? "APNs" : "FCM"}`);
    try {
      token = await obtainNativeToken();
    } catch (failure) {
      throw nativePushFailure(failure?.stage || "register", failure?.error ?? failure, platform);
    }
    pushLog(`received ${tokenSummary(token)}; saving to push_device_tokens`);
    try {
      await saveNativeToken(token, platform);
    } catch (error) {
      throw nativePushFailure("save", error, platform);
    }
    pushLog("device registered for push");
    writeNativePushState({ platform, token, userId, savedAt: new Date().toISOString() });
    writePushDiagnostic(null);
    return "enabled";
  })().finally(() => {
    registrationInFlight = null;
  });
  return registrationInFlight;
}

async function unregisterThisDevice(state) {
  if (state?.token) {
    const { error } = await supabase.rpc("unregister_push_device_token", { p_token: state.token });
    if (error) throw new Error(i18nText("nativePushFix.saveFailed"));
  }
  writeNativePushState(null);
}

async function getNativePushStatus() {
  if (registrationInFlight) await registrationInFlight.catch(() => {});
  const permission = await nativePermission();
  const userId = await currentUserId();
  const preferenceOn = permission === "granted" ? await accountPushPreference(userId) : null;
  return nativePushStatusFrom({ permission, state: readNativePushState(), userId, preferenceOn });
}

async function enableNativePush() {
  const platform = nativePlatform();
  const userId = await currentUserId();
  if (!userId) throw nativePushFailure("signin", null, platform);
  if (!platform) throw nativePushFailure("register", null, platform);

  let permission = await nativePermission();
  if (permission !== "granted" && permission !== "denied") {
    try {
      permission = String((await PushNotifications.requestPermissions())?.receive || "denied");
    } catch {
      permission = "denied";
    }
  }
  if (permission !== "granted") throw nativePushFailure("permission", null, platform);
  return registerThisDevice(userId, platform);
}

async function disableNativePush() {
  await unregisterThisDevice(readNativePushState());
  writePushDiagnostic(null);
  return "disabled";
}

// Settings: why push is not working on this phone, in words the person can
// act on ("" when nothing went wrong).
export function getPushProblemMessage() {
  if (!isNativeApp()) return "";
  const diagnostic = readPushDiagnostic();
  return diagnostic ? pushProblemText(diagnostic) : "";
}

// Before signing out (while the session still works): this phone stops
// getting the account's pushes. Never holds up sign-out for long.
export async function forgetNativePushDevice() {
  if (!isNativeApp()) return;
  const state = readNativePushState();
  writeNativePushState(null);
  writePushDiagnostic(null);
  if (!state?.token) return;
  try {
    await Promise.race([
      supabase.rpc("unregister_push_device_token", { p_token: state.token }),
      new Promise((resolve) => {
        setTimeout(resolve, 4000);
      }),
    ]);
  } catch {
    // Offline: the sender drops the token once APNs / FCM reports it gone,
    // and it moves to the next account that turns push on on this phone.
  }
}

// App start, sign-in and coming back to the app: keep this phone's server
// registration in line with the OS permission and the account's switch.
async function syncNativePush(trigger) {
  const platform = nativePlatform();
  const userId = await currentUserId();
  if (!platform || !userId) return;
  const permission = await nativePermission();
  const state = readNativePushState();
  const preferenceOn = permission === "granted" ? await accountPushPreference(userId) : null;
  const action = decideNativePushAction({ userId, permission, preferenceOn, state, trigger });
  pushLog(`sync(${trigger}): permission=${permission} accountPush=${preferenceOn} savedOnThisPhone=${Boolean(state?.token && state.userId === userId)} -> ${action}`);
  try {
    if (action === "register") {
      await registerThisDevice(userId, platform);
    } else if (action === "unregister") {
      // Notifications were turned off in the phone's settings.
      await unregisterThisDevice(state);
      writePushDiagnostic(buildPushDiagnostic({ stage: "permission", error: null, platform }));
    }
  } catch {
    // Kept in the diagnostic; Settings shows it the next time it opens.
  }
}

// A push that arrives while KunThai is open: refresh what is on screen and
// show the in-app banner (unless the realtime banner already showed it).
function handleForegroundPush(notification) {
  const banner = foregroundPushBanner(notification);
  const route = banner?.route || normalizePushRoute(notification?.data?.route);
  refreshEventsForRoute(route).forEach((name) => {
    window.dispatchEvent(new CustomEvent(name, { detail: { type: "native-push", route } }));
  });
  window.dispatchEvent(new CustomEvent(NATIVE_PUSH_RECEIVED_EVENT, { detail: { route, kind: banner?.kind || "" } }));
  if (!banner) return;
  setTimeout(() => {
    if (wasBannerShownRecently(bannerContextsForRoute(banner.route))) return;
    showNotificationBanner({
      title: banner.title,
      body: banner.body,
      tone: banner.tone,
      contextKey: banner.contextKey,
      openLabel: i18nText("nativePushFix.open"),
      onOpen: banner.route ? () => handleNotificationTarget(banner.route) : null,
    });
  }, FOREGROUND_BANNER_DELAY_MS);
}

// FCM can replace this phone's token at any time (onNewToken); save the new
// one right away instead of waiting for the next app start.
async function handleTokenRefresh(token) {
  const value = token?.value || "";
  if (registrationInFlight) return;
  const state = readNativePushState();
  const userId = await currentUserId();
  if (!shouldSaveRefreshedToken({ state, userId, token: value })) return;
  pushLog(`token refreshed (${tokenSummary(value)}); saving`);
  try {
    await saveNativeToken(value, state.platform);
    writeNativePushState({ ...state, token: value, savedAt: new Date().toISOString() });
  } catch (error) {
    pushLog(`could not save refreshed token: ${error?.code || error?.message || "error"}`);
  }
}

// Android 8+: the high-importance channel FCM posts background pushes to.
function ensureAndroidPushChannel() {
  if (nativePlatform() !== "android") return;
  for (const channel of ANDROID_PUSH_CHANNELS) {
    Promise.resolve(PushNotifications.createChannel(channel))
      .then(() => pushLog(`notification channel ${channel.id} ready`))
      .catch((error) => pushLog(`notification channel ${channel.id} not created: ${error?.message || "error"}`));
  }
}

// The UrRide horn (a new ride request, "operator arrived") keeps sounding
// until KunThai is opened: clearing its notification is what stops it on
// Android (the 60 s sound belongs to the notification). Other notifications
// stay in the tray.
function clearDeliveredHornNotifications() {
  // Started inside the promise: a plugin without these methods must not
  // break push start-up.
  Promise.resolve()
    .then(() => PushNotifications.getDeliveredNotifications())
    .then((result) => {
      const horns = (result?.notifications || []).filter((notification) => {
        const kind = String(notification?.data?.kind || notification?.tag || "").toLowerCase();
        return HORN_PUSH_KINDS.includes(kind);
      });
      if (!horns.length) return undefined;
      pushLog(`clearing ${horns.length} horn notification(s)`);
      return PushNotifications.removeDeliveredNotifications({ notifications: horns });
    })
    .catch(() => {});
}

let nativePushStarted = false;

// Runs once at startup in the app. Listeners are added before any
// registration: tapping a push opens its screen, a push in the foreground
// shows a banner, and the token is (re)saved after sign-in, on app start and
// when the app comes back (the OS permission may have changed meanwhile).
export function initNativePushNotifications() {
  if (!isNativeApp() || nativePushStarted) return;
  nativePushStarted = true;

  // Added first, before any network work: a cold-start tap is delivered as
  // soon as this listener exists and is queued until the app is ready.
  Promise.resolve(PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action?.notification?.data || {};
    queueNotificationTap({ route: typeof data.route === "string" ? data.route : "", key: pushTapKey(action), source: "native" });
  })).catch(() => {});

  ensureAndroidPushChannel();

  Promise.resolve(PushNotifications.addListener("pushNotificationReceived", (notification) => {
    pushLog(`notification received in foreground: kind=${notification?.data?.kind || "(none)"}`);
    handleForegroundPush(notification);
  })).catch(() => {});

  Promise.resolve(PushNotifications.addListener("registration", handleTokenRefresh)).catch(() => {});

  Promise.resolve(CapacitorApp.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) return;
    clearDeliveredHornNotifications();
    syncNativePush("resume");
  })).catch(() => {});
  clearDeliveredHornNotifications();

  supabase.auth.onAuthStateChange((event) => {
    if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
      setTimeout(() => {
        syncNativePush("startup");
      }, 0);
    }
  });
}

// --- Status for Settings --------------------------------------------------------

// "unsupported" | "denied" | "enabled" | "disabled"
export async function getPushStatus() {
  if (isNativeApp()) return getNativePushStatus();
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? "enabled" : "disabled";
  } catch {
    return "disabled";
  }
}

export async function enablePushNotifications() {
  if (isNativeApp()) return enableNativePush();
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported in this browser. On iPhone, add KunThai to your home screen first.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications stay off until you allow them in your browser.");
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("Sign in to enable push notifications.");

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

  const details = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: details.keys?.p256dh || "",
      auth: details.keys?.auth || "",
      user_agent: navigator.userAgent.slice(0, 250),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message || "Unable to save this device for notifications.");
  return "enabled";
}

export async function disablePushNotifications() {
  if (isNativeApp()) return disableNativePush();
  if (!isPushSupported()) return "unsupported";
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe();
  }
  return "disabled";
}

export async function showKunThaiSystemNotification({ body = "", tag = "kunthai-update", target = "", title = "KunThai" }) {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return false;
  if (Notification.permission !== "granted") return false;
  if (document.visibilityState === "visible" && document.hasFocus()) return false;

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    body,
    icon: "/icons/kunthai-192.png",
    badge: "/icons/kunthai-192.png",
    tag,
    data: { url: "/", target },
  });
  return true;
}
