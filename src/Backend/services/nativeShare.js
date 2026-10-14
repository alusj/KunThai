// Sharing inside the iOS / Android app.
//
// In the app the page is served from the device (capacitor://localhost on
// iOS, https://localhost on Android), so two things broke every Share button
// there while the website worked:
//   1. links were built from that device address, which nobody else can open;
//   2. the WebView's navigator.share is missing (Android) or unreliable (iOS),
//      so the tap fell back to a clipboard copy that could fail silently.
// installNativeShare() fixes both for every existing share call at once:
// navigator.share opens the phone's own share sheet (@capacitor/share) and
// any device-address link in it is rewritten to the public website.

import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

const DEFAULT_PUBLIC_ORIGIN = "https://kunthai.app";
const LOCAL_APP_ORIGINS = ["capacitor://localhost", "https://localhost", "http://localhost", "ionic://localhost"];

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** The public website origin, used for any link that leaves the app. */
export function publicAppOrigin() {
  let configured = "";
  try {
    configured = String(import.meta.env.VITE_PUBLIC_APP_URL || import.meta.env.VITE_API_ORIGIN || "").trim().replace(/\/+$/, "");
  } catch {
    configured = "";
  }
  if (!isNative() && typeof window !== "undefined") return window.location.origin;
  return configured || DEFAULT_PUBLIC_ORIGIN;
}

/** Rewrites a link on the app's device address to the public website. */
export function toShareableUrl(value = "") {
  const text = String(value || "");
  if (!text || !isNative()) return text;
  const publicOrigin = publicAppOrigin();
  return LOCAL_APP_ORIGINS.reduce((result, origin) => result.split(`${origin}/`).join(`${publicOrigin}/`).split(origin).join(publicOrigin), text);
}

let installed = false;

export function installNativeShare() {
  if (installed || typeof navigator === "undefined" || !isNative()) return;
  if (!Capacitor.isPluginAvailable("Share")) return;
  installed = true;

  const browserShare = typeof navigator.share === "function" ? navigator.share.bind(navigator) : null;
  const browserCanShare = typeof navigator.canShare === "function" ? navigator.canShare.bind(navigator) : null;

  const nativeShare = async (data = {}) => {
    // Files (the data export) keep the WebView's own sharing.
    if (Array.isArray(data.files) && data.files.length) {
      if (browserShare) return browserShare(data);
      throw new DOMException("Sharing files is not supported here.", "NotSupportedError");
    }
    try {
      await Share.share({
        title: data.title || undefined,
        text: data.text ? toShareableUrl(data.text) : undefined,
        url: data.url ? toShareableUrl(data.url) : undefined,
        dialogTitle: data.title || undefined,
      });
    } catch (error) {
      // Closing the share sheet is a cancel, exactly like the web API.
      if (/cancel/i.test(String(error?.message || error))) {
        throw new DOMException("Share canceled", "AbortError");
      }
      throw error;
    }
  };

  try {
    Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: nativeShare });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      writable: true,
      value: (data = {}) => (Array.isArray(data?.files) && data.files.length
        ? Boolean(browserCanShare?.(data))
        : true),
    });
  } catch {
    installed = false;
  }
}
