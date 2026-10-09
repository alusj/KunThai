// Real permission status for Settings > Permissions.
// Statuses: "granted" | "denied" | "prompt" | "unsupported" | "unknown".
// The app ships no Capacitor camera/geolocation/push plugins, so everything
// goes through the WebView's web APIs, which the OS permission backs.

export const PERMISSION_IDS = ["camera", "microphone", "location", "notifications"];

const QUERY_NAMES = { camera: "camera", microphone: "microphone", location: "geolocation", notifications: "notifications" };

// Normalises PermissionState / Notification.permission values.
export function normalizePermissionState(value) {
  if (value === "granted" || value === "denied" || value === "prompt") return value;
  if (value === "default") return "prompt";
  return "unknown";
}

function hasMediaDevices() {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

export function isPermissionApiAvailable(id, { native = false } = {}) {
  if (typeof navigator === "undefined") return false;
  if (id === "camera" || id === "microphone") return hasMediaDevices();
  if (id === "location") return Boolean(navigator.geolocation);
  if (id === "notifications") return !native && typeof window !== "undefined" && "Notification" in window;
  return false;
}

export async function readPermissionStatus(id, { native = false } = {}) {
  if (!isPermissionApiAvailable(id, { native })) return "unsupported";
  if (id === "notifications") return normalizePermissionState(window.Notification.permission);
  try {
    if (typeof navigator.permissions?.query !== "function") return "unknown";
    const result = await navigator.permissions.query({ name: QUERY_NAMES[id] });
    return normalizePermissionState(result?.state);
  } catch {
    // Safari/WebView may not know "camera"/"microphone" names.
    return "unknown";
  }
}

// Asks the OS/browser for the permission. Resolves the new status.
export async function requestPermission(id, { native = false } = {}) {
  if (!isPermissionApiAvailable(id, { native })) return "unsupported";
  try {
    if (id === "camera" || id === "microphone") {
      const stream = await navigator.mediaDevices.getUserMedia(id === "camera" ? { video: true } : { audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return "granted";
    }
    if (id === "location") {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 15000 });
      });
      return "granted";
    }
    if (id === "notifications") {
      return normalizePermissionState(await window.Notification.requestPermission());
    }
  } catch (error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError" || error?.code === 1) return "denied";
    return readPermissionStatus(id, { native });
  }
  return "unknown";
}
