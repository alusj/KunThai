import { Capacitor, registerPlugin } from "@capacitor/core";

// Whether this phone gives KunThai precise or only approximate location, and
// asking for precise when it is approximate. iOS "Precise Location" off, or
// Android's "Approximate" choice, blurs every fix to 1-3 km, which no GPS
// waiting improves, so UrRide asks the phone itself:
//   iOS     – "Allow KunThai to use your precise location?" for this session
//             (the reasons are in Info.plist, NSLocationTemporaryUsageDescriptionDictionary)
//   Android – "Change to precise location"
// When the phone won't ask (already refused), the caller opens Settings.
// Native: ios/App/App/LocationAccuracyPlugin.swift and
// android/app/src/main/java/app/kunthai/mobile/KunThaiLocationAccuracyPlugin.java.
// Web: always "unknown" (browsers don't say).

const KunThaiLocationAccuracy = registerPlugin("KunThaiLocationAccuracy");

export const PRECISE_PURPOSE_PASSENGER = "UrRidePassenger";
export const PRECISE_PURPOSE_OPERATOR = "UrRideOperator";

const UNKNOWN = Object.freeze({ accuracy: "unknown", authorization: "unknown", platform: "" });

function nativePlatform() {
  try {
    return Capacitor.getPlatform();
  } catch {
    return "";
  }
}

let lastStatus = UNKNOWN;
const listeners = new Set();

function pluginReady() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("KunThaiLocationAccuracy");
  } catch {
    return false;
  }
}

function remember(status) {
  const next = {
    accuracy: ["full", "reduced"].includes(status?.accuracy) ? status.accuracy : "unknown",
    authorization: String(status?.authorization || "unknown"),
    platform: nativePlatform(),
  };
  const changed = next.accuracy !== lastStatus.accuracy || next.authorization !== lastStatus.authorization;
  lastStatus = next;
  if (changed) {
    for (const listener of listeners) {
      try {
        listener(next);
      } catch {
        // A broken listener must not stop the others.
      }
    }
  }
  return next;
}

// The last status read on this phone (no native call).
export function readKnownLocationAccuracy() {
  return lastStatus;
}

// { accuracy: "full" | "reduced" | "unknown", authorization, platform }.
export async function readLocationAccuracy() {
  if (!pluginReady()) return UNKNOWN;
  try {
    return remember(await KunThaiLocationAccuracy.status());
  } catch {
    return UNKNOWN;
  }
}

// Hears every change of the status (after a read or a request).
export function subscribeLocationAccuracy(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Asks for precise location when the phone only gives approximate. Never
// prompts for location itself (only upgrades an existing permission).
// Resolves the status afterwards; "full" means precise fixes from now on.
export async function requestPreciseLocation({ purpose = PRECISE_PURPOSE_PASSENGER } = {}) {
  if (!pluginReady()) return UNKNOWN;
  try {
    const before = remember(await KunThaiLocationAccuracy.status());
    if (before.accuracy !== "reduced") return before;
    return remember(await KunThaiLocationAccuracy.requestFullAccuracy({ purpose }));
  } catch {
    return lastStatus;
  }
}

// A fix this rough means the phone may only allow approximate location (iOS
// reports exactly 1414 m with Precise Location off).
export const APPROXIMATE_FIX_METERS = 1000;
const askedThisSession = new Set();

// Called with every fix while KunThai is on screen: the first approximate one
// for a purpose asks the phone for precise location, once per app session per
// purpose (iOS shows its prompt at most once per session anyway). Operators
// resumed at launch and passengers who never tapped anything otherwise kept
// sharing and reading 1-3 km blurred positions.
export function askPreciseIfApproximate(accuracy, { purpose = PRECISE_PURPOSE_PASSENGER } = {}) {
  const metres = Number(accuracy);
  if (!Number.isFinite(metres) || metres < APPROXIMATE_FIX_METERS) return;
  if (askedThisSession.has(purpose) || !pluginReady()) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  askedThisSession.add(purpose);
  requestPreciseLocation({ purpose }).catch(() => {});
}

// Precise location if the phone will ask; otherwise KunThai's settings, where
// it can be switched on (iOS: Location › Precise Location; Android:
// Permissions › Location › Use precise location). Resolves true when precise
// location is on now.
export async function fixApproximateLocation({ purpose = PRECISE_PURPOSE_PASSENGER, openSettings = async () => {} } = {}) {
  const status = await requestPreciseLocation({ purpose });
  if (status.accuracy === "full") return true;
  await openSettings();
  return false;
}
