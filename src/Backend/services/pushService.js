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
  NATIVE_PUSH_DIAGNOSTIC_KEY,
  NATIVE_PUSH_RECEIVED_EVENT,
  bannerContextsForRoute,
  buildPushDiagnostic,
  decideNativePushAction,
  diagnosticMessage,
  foregroundPushBanner,
  nativePushStatusFrom,
  normalizePushRoute,
  refreshEventsForRoute,
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

function handleNotificationTarget(target = "", url = "") {
  runNotificationAction(() => {
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
  });
}

export function registerKunThaiServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      if (import.meta.env.DEV) console.warn("[KunThai] service worker registration failed", error);
    });
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "kunthai-notification-click") {
      handleNotificationTarget(event.data.target, event.data.url);
    }
  });
}

// --- Native push (iOS / Android app) -----------------------------------------

const NATIVE_PUSH_KEY = "kunthai.nativePush";
const NATIVE_REGISTER_TIMEOUT_MS = 20_000;
const FOREGROUND_BANNER_DELAY_MS = 1500;

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
    try {
      token = await obtainNativeToken();
    } catch (failure) {
      throw nativePushFailure(failure?.stage || "register", failure?.error ?? failure, platform);
    }
    try {
      await saveNativeToken(token, platform);
    } catch (error) {
      throw nativePushFailure("save", error, platform);
    }
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

let nativePushStarted = false;

// Runs once at startup in the app. Listeners are added before any
// registration: tapping a push opens its screen, a push in the foreground
// shows a banner, and the token is (re)saved after sign-in, on app start and
// when the app comes back (the OS permission may have changed meanwhile).
export function initNativePushNotifications() {
  if (!isNativeApp() || nativePushStarted) return;
  nativePushStarted = true;

  Promise.resolve(PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action?.notification?.data || {};
    const route = typeof data.route === "string" ? data.route : "";
    if (route) handleNotificationTarget(route);
  })).catch(() => {});

  Promise.resolve(PushNotifications.addListener("pushNotificationReceived", handleForegroundPush)).catch(() => {});

  Promise.resolve(CapacitorApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive) syncNativePush("resume");
  })).catch(() => {});

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
