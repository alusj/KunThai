// Location inside the iOS app.
//
// The page is served from capacitor://localhost, so WebKit asks for location
// itself — "\"localhost\" would like to use your current location" — right
// after iOS's own "Allow KunThai to use your location?". Two prompts, one of
// them naming "localhost", looks broken (and App Review notices). WebKit has no
// public way to skip its prompt, so installNativeGeolocation() swaps
// navigator.geolocation for the native one (KunThaiLocationAccuracyPlugin in
// ios/App/App/LocationAccuracyPlugin.swift): every existing location call keeps
// working and only iOS's prompt is ever shown. Android's WebView already asks
// through the app, so it keeps the browser's geolocation.

import { Capacitor, registerPlugin } from "@capacitor/core";

const KunThaiLocationAccuracy = registerPlugin("KunThaiLocationAccuracy");

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

function positionError(code, message) {
  return { code, message, PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT };
}

function nativeError(error) {
  const code = Number(error?.code) === PERMISSION_DENIED ? PERMISSION_DENIED : POSITION_UNAVAILABLE;
  return positionError(code, error?.message || "Your location is not available right now.");
}

function toPosition(data = {}) {
  const coords = data.coords || {};
  return {
    timestamp: Number(data.timestamp) || Date.now(),
    coords: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      altitude: coords.altitude ?? null,
      altitudeAccuracy: coords.altitudeAccuracy ?? null,
      heading: coords.heading ?? null,
      speed: coords.speed ?? null,
    },
  };
}

// Same shape and behaviour as the browser's navigator.geolocation.
export function createNativeGeolocation(plugin = KunThaiLocationAccuracy) {
  let nextWatchId = 1;
  const watches = new Map(); // web watch id -> native callback id (or a promise of it)

  function getCurrentPosition(success, failure, options = {}) {
    let done = false;
    const timeout = Number(options?.timeout);
    const timer = Number.isFinite(timeout) && timeout >= 0 && timeout !== Infinity
      ? setTimeout(() => {
          if (done) return;
          done = true;
          failure?.(positionError(TIMEOUT, "Finding your location took too long."));
        }, timeout)
      : null;

    plugin
      .getCurrentPosition({ maximumAge: Number(options?.maximumAge) || 0 })
      .then((data) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        success?.(toPosition(data));
      })
      .catch((error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        failure?.(nativeError(error));
      });
  }

  function watchPosition(success, failure) {
    const id = nextWatchId++;
    const callbackId = Promise.resolve(
      plugin.watchPosition({}, (data, error) => {
        if (!watches.has(id)) return;
        if (error) failure?.(nativeError(error));
        else if (data) success?.(toPosition(data));
      }),
    );
    watches.set(id, callbackId);
    callbackId.then((nativeId) => {
      if (watches.has(id)) watches.set(id, nativeId);
      else plugin.clearWatch({ id: nativeId }).catch(() => {});
    });
    return id;
  }

  function clearWatch(id) {
    const nativeId = watches.get(id);
    watches.delete(id);
    // Still starting: the .then above clears it once the native id arrives.
    if (typeof nativeId === "string") plugin.clearWatch({ id: nativeId }).catch(() => {});
  }

  return { getCurrentPosition, watchPosition, clearWatch };
}

// permissions.query({ name: "geolocation" }) answered from iOS, not WebKit.
async function queryNativeLocationPermission(plugin) {
  const status = await plugin.status();
  const authorization = status?.authorization;
  const state = authorization === "whenInUse" || authorization === "always"
    ? "granted"
    : authorization === "prompt" ? "prompt" : "denied";
  return { name: "geolocation", state, onchange: null };
}

export function installNativeGeolocation() {
  try {
    if (Capacitor.getPlatform() !== "ios" || !Capacitor.isPluginAvailable("KunThaiLocationAccuracy")) return false;
    if (typeof navigator === "undefined") return false;

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: createNativeGeolocation(),
    });

    const query = navigator.permissions?.query?.bind(navigator.permissions);
    if (query) {
      navigator.permissions.query = (descriptor) =>
        descriptor?.name === "geolocation" ? queryNativeLocationPermission(KunThaiLocationAccuracy) : query(descriptor);
    }
    return true;
  } catch {
    // The browser's geolocation still works, with WebKit's extra prompt.
    return false;
  }
}
