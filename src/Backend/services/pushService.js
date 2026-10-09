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
// reactions and order updates in push_outbox, and
// supabase/functions/send-native-push delivers them. Each push carries a
// "route" (e.g. "conversation:<id>", "notifications", "orders") that opens
// the matching screen when tapped.
//
// Both only send to accounts whose user_notification_preferences.push_enabled
// is true; the Settings switch moves it together with this device.

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import supabase from "../lib/supabaseClient";
import { t as i18nText } from "../../i18n/index";
import { requestExploreScreen, requestMarketplaceScreen, runNotificationAction } from "./notificationBannerService";
import { requestConversationOpen } from "./explore/messageService";

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
    const [kind, id] = String(target || "").split(":");
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

// Asks iOS / Android for this device's push token. Rejects with an honest
// message when the app build has no push set up (no Push Notifications
// capability on iOS, no google-services.json on Android) or registration
// hangs.
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
    const fail = () => finish(reject, new Error(i18nText("exploreNativeFix.pushRegisterFailed")));
    timer = setTimeout(fail, NATIVE_REGISTER_TIMEOUT_MS);

    Promise.all([
      PushNotifications.addListener("registration", (token) => {
        if (token?.value) finish(resolve, token.value);
        else fail();
      }),
      PushNotifications.addListener("registrationError", fail),
    ])
      .then((added) => {
        if (settled) {
          added.forEach((handle) => handle?.remove?.());
          return undefined;
        }
        handles = added;
        return PushNotifications.register();
      })
      .catch(fail);
  });
}

async function saveNativeToken(token, platform) {
  const { error } = await supabase.rpc("register_push_device_token", { p_token: token, p_platform: platform });
  if (error) throw new Error(i18nText("exploreNativeFix.pushSaveFailed"));
}

async function getNativePushStatus() {
  const permission = await nativePermission();
  if (permission === "denied") return "denied";
  const state = readNativePushState();
  const userId = await currentUserId();
  return permission === "granted" && state && userId && state.userId === userId ? "enabled" : "disabled";
}

async function enableNativePush() {
  const userId = await currentUserId();
  if (!userId) throw new Error(i18nText("exploreNativeFix.pushSignIn"));
  const platform = nativePlatform();
  if (!platform) throw new Error(i18nText("exploreNativeFix.pushRegisterFailed"));

  let permission = await nativePermission();
  if (permission !== "granted" && permission !== "denied") {
    try {
      permission = String((await PushNotifications.requestPermissions())?.receive || "denied");
    } catch {
      permission = "denied";
    }
  }
  if (permission !== "granted") throw new Error(i18nText("exploreNativeFix.pushPermissionNeeded"));

  const token = await obtainNativeToken();
  await saveNativeToken(token, platform);
  writeNativePushState({ platform, token, userId, savedAt: new Date().toISOString() });
  return "enabled";
}

async function disableNativePush() {
  const state = readNativePushState();
  if (state?.token) {
    const { error } = await supabase.rpc("unregister_push_device_token", { p_token: state.token });
    if (error) throw new Error(i18nText("exploreNativeFix.pushSaveFailed"));
  }
  writeNativePushState(null);
  return "disabled";
}

// Before signing out (while the session still works): this phone stops
// getting the account's pushes. Never holds up sign-out for long.
export async function forgetNativePushDevice() {
  if (!isNativeApp()) return;
  const state = readNativePushState();
  writeNativePushState(null);
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

let nativePushStarted = false;

// Runs once at startup in the app: tapping a push opens the screen it is
// about, and an account that has push on refreshes this phone's token (it
// can change after an OS update or a reinstall).
export function initNativePushNotifications() {
  if (!isNativeApp() || nativePushStarted) return;
  nativePushStarted = true;

  Promise.resolve(PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action?.notification?.data || {};
    const route = typeof data.route === "string" ? data.route : "";
    if (route) handleNotificationTarget(route);
  })).catch(() => {});

  const refresh = async (userId) => {
    const state = readNativePushState();
    if (!userId || !state || state.userId !== userId) return;
    if ((await nativePermission()) !== "granted") return;
    try {
      const token = await obtainNativeToken();
      await saveNativeToken(token, state.platform || nativePlatform());
      writeNativePushState({ ...state, token, savedAt: new Date().toISOString() });
    } catch {
      // Settings shows the honest state the next time it is opened.
    }
  };

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
      const userId = session?.user?.id || "";
      setTimeout(() => {
        refresh(userId);
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
