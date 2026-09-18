// URL for a KunThai Vercel API route (`/api/...`).
//
// On the web the page and the API share an origin, so the relative path is
// used as-is. Inside the Capacitor app the page is served from the device
// (https://localhost on Android, capacitor://localhost on iOS), where a
// relative `/api/...` never reaches Vercel — so native builds call the deployed
// origin directly. The API allows those two app origins through CORS
// (server/cors.js).
const DEFAULT_NATIVE_API_ORIGIN = "https://kunthai.app";

function nativeApiOrigin() {
  const configured = String(import.meta.env?.VITE_API_ORIGIN || "").trim().replace(/\/+$/, "");
  return configured || DEFAULT_NATIVE_API_ORIGIN;
}

// The native shell injects window.Capacitor before the app loads; checking it
// directly keeps this helper free of plugin imports (and usable in Node tests).
export function isNativeApp() {
  try {
    return Boolean(typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function apiUrl(path) {
  return isNativeApp() ? `${nativeApiOrigin()}${path}` : path;
}
