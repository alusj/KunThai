// Pure decisions behind the operator's live-location sharing
// (operatorLiveLocationService.js). No Supabase, no Capacitor, no DOM, so they
// run under `node --test`.

// Moving: publish at most every 6 s unless the operator moved 12 m or more.
export const MIN_PUBLISH_INTERVAL_MS = 6000;
export const MIN_MOVE_METERS = 12;
// Passengers count an operator as available for 2 minutes after a check-in
// (transport_available_operators_nearby), so 30 s survives missed beats.
export const HEARTBEAT_INTERVAL_MS = 30_000;
// Native (background) path: the OS only reports a new fix after 25 m, so a
// parked operator gets no callbacks; a timer re-sends the last known fix once
// no publish happened for HEARTBEAT_INTERVAL_MS. It checks every 10 s, so a
// heartbeat lands 30–40 s after the previous publish.
export const NATIVE_DISTANCE_FILTER_METERS = 25;
export const NATIVE_HEARTBEAT_CHECK_MS = 10_000;

export function distanceInMeters(a, b) {
  if (!a || !b) return Infinity;
  const earthRadius = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

// Whether a fix (or a forced heartbeat) should be written now. A forced write
// always goes; otherwise it waits MIN_PUBLISH_INTERVAL_MS unless the operator
// moved MIN_MOVE_METERS since the last write.
export function shouldPublishFix({ now, lastPublishedAt = 0, lastPublishedPoint = null, point, force = false }) {
  if (!point) return false;
  if (force) return true;
  if (now - lastPublishedAt >= MIN_PUBLISH_INTERVAL_MS) return true;
  return distanceInMeters(lastPublishedPoint, point) >= MIN_MOVE_METERS;
}

// Native heartbeat: re-send the last known position when nothing was written
// for `intervalMs` (no new fix from the OS, e.g. a parked operator). Needs a
// position to send.
export function nativeHeartbeatDue({ now, lastPublishedAt = 0, hasPoint, intervalMs = HEARTBEAT_INTERVAL_MS }) {
  if (!hasPoint) return false;
  return now - lastPublishedAt >= intervalMs;
}

// Which engine shares the position: the background plugin inside the native
// app (when the native project has it), the WebView's navigator.geolocation
// otherwise (web, or an app build that wasn't synced with the plugin yet).
export function chooseLocationEngine({ isNative = false, pluginAvailable = false, hasWebGeolocation = false } = {}) {
  if (isNative && pluginAvailable) return "native";
  if (hasWebGeolocation) return "web";
  return "none";
}

// Turns the plugin's checkPermissions() result into what the operator needs:
// "background"     – keeps sharing with the phone locked
// "foregroundOnly" – iOS "While using": works in the foreground, may stop when locked
// "denied"         – no location for KunThai
// "prompt"         – never asked
// "unknown"        – no answer from the plugin
// Android shares from a foreground service with a visible notification, which
// only needs the normal location permission (no ACCESS_BACKGROUND_LOCATION).
export function describeBackgroundAccess({ platform = "", permissions = null } = {}) {
  if (!permissions || typeof permissions !== "object") return "unknown";
  const location = permissions.location;
  if (location === "denied") return "denied";
  if (location === "prompt" || location === "prompt-with-rationale") return "prompt";
  if (location !== "granted") return "unknown";
  if (platform === "ios") {
    const background = permissions.backgroundLocation;
    if (background === "granted" || background === "always") return "background";
    return "foregroundOnly";
  }
  return "background";
}

// The explanation sheet before the system prompts, shown when the operator
// switches Active on in the native app. Never when access is already enough or
// when the system can't prompt any more (denied: the amber hint offers
// Settings instead). "While using" on iOS (and a missing notification
// permission on Android) is only explained once: iOS shows the "Always"
// upgrade prompt a single time.
export function needsBackgroundConsentSheet({ isNative = false, platform = "", permissions = null, explainedBefore = false } = {}) {
  if (!isNative) return false;
  const access = describeBackgroundAccess({ platform, permissions });
  if (access === "prompt") return true;
  if (access === "denied" || access === "unknown") return false;
  if (access === "foregroundOnly") return !explainedBefore;
  if (platform === "android" && permissions?.notification && permissions.notification !== "granted") {
    return !explainedBefore && permissions.notification !== "denied";
  }
  return false;
}

// What the presence host does when the app opens or returns to the
// foreground: resume sharing for an operator whose account is online, only
// when location was allowed before (so it never prompts) and only when it
// isn't already running. Otherwise nothing: going offline, signing out and
// switching account stop sharing where they happen.
export function presenceResumeAction({ running = false, previouslyGranted = false, account = undefined } = {}) {
  if (running || !previouslyGranted || !account) return "none";
  return account.activeStatus === "active" ? "start" : "none";
}
