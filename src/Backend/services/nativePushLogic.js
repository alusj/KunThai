// Pure decisions for native push in the iOS / Android app (no Capacitor or
// Supabase imports, so they are unit-tested in nativePushLogic.test.js):
// - what went wrong when this phone could not be set up for push,
// - when to (re)register or unregister this phone's token,
// - what a push that arrives while the app is open shows and opens.
// Device tokens never pass through here and are never logged.

export const NATIVE_PUSH_DIAGNOSTIC_KEY = "kunthai.nativePushDiagnostic";
export const NATIVE_PUSH_RECEIVED_EVENT = "kunthai-native-push-received";
const RESUME_REFRESH_MS = 12 * 60 * 60 * 1000;
const MAX_DETAIL_LENGTH = 160;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

// The readable part of a native error: an Error, the plugin's
// registrationError payload ({ error }), or a string.
export function nativeErrorText(error) {
  const raw = typeof error === "string"
    ? error
    : text(error?.message) || text(error?.error) || text(error?.errorMessage) || "";
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL_LENGTH);
}

// "permissionDenied" | "signIn" | "iosMissingEntitlement" | "iosSimulator" |
// "androidMissingFirebase" | "timeout" | "saveFailed" | "registerFailed"
export function classifyPushFailure({ stage = "", message = "", code = "", platform = "" } = {}) {
  if (stage === "permission") return "permissionDenied";
  if (stage === "signin") return "signIn";
  const detail = `${code} ${message}`;
  if (/aps-environment/i.test(detail)) return "iosMissingEntitlement";
  if (/simulator/i.test(detail)) return "iosSimulator";
  if (platform !== "ios" && /firebaseapp|firebase app|google-services|googleservices|FIS_|MISSING_INSTANCEID_SERVICE|SERVICE_NOT_AVAILABLE|AUTHENTICATION_FAILED|play services/i.test(detail)) {
    return "androidMissingFirebase";
  }
  if (stage === "timeout") return "timeout";
  if (stage === "save") return "saveFailed";
  return "registerFailed";
}

// What is kept in localStorage so Settings can explain the last failure.
export function buildPushDiagnostic({ stage, error, platform = "", at = new Date().toISOString() }) {
  const message = nativeErrorText(error);
  const code = text(typeof error === "object" ? String(error?.code ?? "") : "").slice(0, 60);
  return {
    stage: String(stage || "register"),
    code,
    message,
    platform: String(platform || ""),
    reason: classifyPushFailure({ stage, message, code, platform }),
    at,
  };
}

// The translation key (nativePushFix.<key>) and values for a diagnostic.
export function diagnosticMessage(diagnostic) {
  const reason = diagnostic?.reason || classifyPushFailure(diagnostic || {});
  switch (reason) {
    case "permissionDenied":
      return { key: diagnostic?.platform === "android" ? "permissionDeniedAndroid" : "permissionDeniedIos", vars: null };
    case "signIn":
      return { key: "signIn", vars: null };
    case "iosMissingEntitlement":
      return { key: "iosMissingEntitlement", vars: null };
    case "iosSimulator":
      return { key: "iosSimulator", vars: null };
    case "androidMissingFirebase":
      return { key: "androidMissingFirebase", vars: null };
    case "timeout":
      return { key: "timeout", vars: null };
    case "saveFailed":
      return { key: "saveFailed", vars: null };
    default:
      return diagnostic?.message
        ? { key: "registerFailedDetail", vars: { detail: diagnostic.message } }
        : { key: "registerFailed", vars: null };
  }
}

function ownState(state, userId) {
  return state && state.token && userId && state.userId === userId ? state : null;
}

// "register" | "unregister" | "none". Never asks for permission by itself.
// trigger: "startup" (app start / sign-in) or "resume" (back from background).
// preferenceOn: the account's user_notification_preferences.push_enabled, or
// null when it could not be read.
export function decideNativePushAction({ userId = "", permission = "prompt", preferenceOn = null, state = null, trigger = "startup", now = Date.now() } = {}) {
  if (!userId) return "none";
  const mine = ownState(state, userId);
  if (permission === "denied") return mine ? "unregister" : "none";
  if (permission !== "granted") return "none";
  if (preferenceOn === false) return "none";
  // Push is on for the account but this phone has no saved token (reinstall,
  // cleared storage): register it again. Unknown preference: only refresh a
  // token this phone already saved.
  if (!mine) return preferenceOn === true ? "register" : "none";
  if (trigger === "resume") {
    const savedAt = Date.parse(mine.savedAt || "") || 0;
    return now - savedAt > RESUME_REFRESH_MS ? "register" : "none";
  }
  return "register";
}

// "denied" | "enabled" | "disabled" for the Settings switch.
export function nativePushStatusFrom({ permission = "prompt", state = null, userId = "", preferenceOn = null } = {}) {
  if (permission === "denied") return "denied";
  return permission === "granted" && ownState(state, userId) && preferenceOn !== false ? "enabled" : "disabled";
}

// Web push targets look like "<sector>:notifications"; native routes are
// "conversation:<id>", "notifications", "orders", "urmall", "urride".
export function normalizePushRoute(route = "") {
  const value = text(route);
  const [kind, id] = value.split(":");
  if (id === "notifications" && ["platform", "explore", "all"].includes(kind)) return "notifications";
  if (id === "notifications" && kind === "marketplace") return "urmall";
  if (id === "notifications" && kind === "transport") return "urride";
  return value;
}

// Banners already shown for this route (by the realtime banner hosts) make a
// push banner a duplicate. Returns banner context-key prefixes to check.
export function bannerContextsForRoute(route = "") {
  const value = normalizePushRoute(route);
  if (value.startsWith("conversation:")) return [value];
  if (value === "notifications") return ["explore-notification:", "explore:", "platform-notification:"];
  if (value === "orders" || value.startsWith("urmall")) return ["marketplace:"];
  if (value.startsWith("urride")) return ["transport:"];
  return [];
}

// Window events that make open lists and unread counts refresh.
export function refreshEventsForRoute(route = "") {
  const value = normalizePushRoute(route);
  const events = ["kuntai-unified-notifications-updated"];
  if (value.startsWith("conversation:") || value === "messages") events.push("explore-message-event");
  if (value === "orders" || value.startsWith("urmall")) events.push("marketplace-orders-updated");
  return events;
}

// A push received while the app is open -> what the in-app banner shows.
// iOS hands over the APNs payload (aps.alert); Android the FCM notification.
export function foregroundPushBanner(notification) {
  if (!notification || typeof notification !== "object") return null;
  const data = notification.data && typeof notification.data === "object" ? notification.data : {};
  const alert = data.aps && typeof data.aps === "object" ? data.aps.alert : null;
  const title = text(notification.title) || text(alert?.title);
  const body = text(notification.body) || text(alert?.body) || text(typeof alert === "string" ? alert : "");
  if (!title && !body) return null;
  const route = normalizePushRoute(text(data.route));
  return {
    title: title || "KunThai",
    body,
    route,
    kind: text(data.kind),
    tone: route.startsWith("conversation:") ? "message" : "activity",
    contextKey: route.startsWith("conversation:") ? route : `native-push:${route || "general"}`,
  };
}
