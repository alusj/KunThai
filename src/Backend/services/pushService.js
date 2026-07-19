// Web Push client: service worker registration, per-device subscription
// management, and routing of notification taps back into the app.
//
// Platform reality: background push works on Android/desktop Chromium and
// Firefox from the browser tab; on iPhone it only works after the user adds
// KunThai to their home screen (iOS 16.4+ installed PWA). getPushStatus()
// reports "unsupported" where the APIs are missing.

import supabase from "../lib/supabaseClient";
import { requestExploreScreen } from "./notificationBannerService";
import { requestConversationOpen } from "./explore/messageService";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function isPushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
    && Boolean(VAPID_PUBLIC_KEY);
}

function handleNotificationTarget(target = "", url = "") {
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
    window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "marketplace", source: id || "" } }));
    return;
  }
  if (kind === "urride") {
    window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "transport", source: id || "" } }));
    return;
  }
  if (kind === "orders") {
    window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "marketplace" } }));
    return;
  }
  if (url && url !== "/" && url !== window.location.href) {
    window.location.assign(url);
  }
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

export async function getPushStatus() {
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
