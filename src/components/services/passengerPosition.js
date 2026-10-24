// Where the passenger is, for "near you" lists. Never surprises anyone with a
// permission prompt: it only asks when `prompt` is true (the passenger tapped
// "Use my location"). Otherwise it uses GPS only when permission was already
// given, then the cached device location, then nothing.

import { ensureBuyerLocation, readCachedBuyerLocation } from "../../Backend/utils/buyerLocationContext";
import { getPreciseCurrentPosition } from "../../Backend/utils/precisePosition";
import { GOOD_FIX_METERS, acceptFix } from "./operatorLocationPolicy.js";
import { askPreciseIfApproximate, readLocationAccuracy, requestPreciseLocation } from "./preciseLocationAccess.js";

const GRANTED_KEY = "kunthai.locationGranted.v1";

function rememberGranted() {
  try {
    localStorage.setItem(GRANTED_KEY, "1");
  } catch {
    // Storage can be unavailable; the passenger can tap the button again.
  }
}

async function permissionAlreadyGranted() {
  try {
    if (localStorage.getItem(GRANTED_KEY) === "1") return true;
  } catch {
    // Fall through to the Permissions API.
  }
  // The Android app: the WebView uses the app's own location permission, but
  // its Permissions API answers "prompt" even when that is allowed, so a
  // Samsung passenger never got a position (no live list, no distances, no
  // "approximate"). The app's real permission comes from the native plugin.
  // iOS keeps the flag and the Permissions API: its WebView can ask on its own.
  const native = await readLocationAccuracy();
  if (native.platform === "android" && ["whenInUse", "always"].includes(native.authorization)) return true;
  try {
    const status = await navigator.permissions?.query?.({ name: "geolocation" });
    return status?.state === "granted";
  } catch {
    return false;
  }
}

function roughPosition() {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 10_000 },
    );
  });
}

// "250 m away" is only right with a GPS fix: a quick network fix can be 1-2 km
// off. So the best GPS reading within a few seconds is used (longer when the
// passenger tapped Refresh), and the old quick read only when GPS gives nothing.
async function currentPosition({ fresh = false } = {}) {
  try {
    return await getPreciseCurrentPosition({
      targetAccuracyMeters: fresh ? 25 : 50,
      maxWaitMs: fresh ? 8000 : 4000,
    });
  } catch (error) {
    if (error?.code === 1) return null;
    return roughPosition();
  }
}

// A continuous GPS watch while a "near you" list is on screen. A new one-off
// request is answered first with a rough cell fix (an iPhone says ~1.4 km)
// and GPS needs longer than a list refresh can wait, so the lists showed
// "within about 1.8 km" next to the operator. The watch lets GPS settle and
// every read uses its latest fix. A rough fix close to a recent good one (in
// its own error circle) does not replace it, same rule as the operator side.
const WATCH_FRESH_MS = 30_000;
const watchState = { id: null, users: 0, fix: null, good: null, listeners: new Set() };

function toPassengerFix(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    at: Date.now(),
  };
}

function takeWatchedPosition(position) {
  const next = toPassengerFix(position);
  askPreciseIfApproximate(next.accuracy);
  const point = { lat: next.latitude, lng: next.longitude };
  if (!acceptFix({ now: next.at, point, accuracy: next.accuracy, lastGood: watchState.good })) {
    // Rough noise around a good fix: still there, keep the good position.
    watchState.fix = { ...watchState.fix, at: next.at };
    return;
  }
  watchState.fix = next;
  if (next.accuracy != null && next.accuracy <= GOOD_FIX_METERS) {
    watchState.good = { point, accuracy: next.accuracy, at: next.at };
  }
  rememberGranted();
  for (const listener of watchState.listeners) listener(next);
}

function watchedFix() {
  const fix = watchState.fix;
  return fix && Date.now() - fix.at < WATCH_FRESH_MS ? fix : null;
}

// Starts (or joins) the watch; only when location was already allowed, so it
// never prompts. `onFix` hears each accepted fix. Returns stop().
export function watchPassengerPosition(onFix = () => {}) {
  if (typeof navigator === "undefined" || !navigator.geolocation?.watchPosition) return () => {};
  let stopped = false;
  watchState.users += 1;
  watchState.listeners.add(onFix);
  permissionAlreadyGranted().then((granted) => {
    if (stopped || !granted || watchState.id !== null || watchState.users === 0) return;
    watchState.id = navigator.geolocation.watchPosition(takeWatchedPosition, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 30_000,
    });
  });
  return () => {
    if (stopped) return;
    stopped = true;
    watchState.listeners.delete(onFix);
    watchState.users -= 1;
    if (watchState.users === 0 && watchState.id !== null) {
      navigator.geolocation.clearWatch(watchState.id);
      watchState.id = null;
    }
  };
}

// Resolves { latitude, longitude, accuracy, place, source: "device" | "cached" }
// or null. `fresh`: the passenger asked for an up-to-date position (Refresh).
export async function getPassengerPosition({ prompt = false, fresh = false } = {}) {
  // The passenger asked (Use my location / Refresh): a phone that only gives
  // KunThai approximate location is asked for precise first, since no GPS
  // waiting beats a 1-3 km blur. Only upgrades a permission already given.
  if (prompt || fresh) await requestPreciseLocation();
  const cached = readCachedBuyerLocation();
  const place = cached?.community || cached?.city || "";

  // The running watch already has where the passenger is (Refresh still asks
  // for a new fix unless the watch's is good).
  const watched = watchedFix();
  if (watched && (!fresh || (watched.accuracy != null && watched.accuracy <= GOOD_FIX_METERS))) {
    return { latitude: watched.latitude, longitude: watched.longitude, accuracy: watched.accuracy, place, source: "device" };
  }

  if (typeof navigator !== "undefined" && navigator.geolocation && (prompt || (await permissionAlreadyGranted()))) {
    const position = await currentPosition({ fresh });
    if (position) {
      rememberGranted();
      askPreciseIfApproximate(position.coords.accuracy);
      // Refreshes the shared city label in the background (no prompt).
      ensureBuyerLocation().catch(() => {});
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        place,
        source: "device",
      };
    }
  }

  if (cached) {
    return { latitude: Number(cached.latitude), longitude: Number(cached.longitude), place, source: "cached" };
  }
  return null;
}
