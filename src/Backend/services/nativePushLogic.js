// Pure decisions for native push in the iOS / Android app (no Capacitor or
// Supabase imports, so they are unit-tested in nativePushLogic.test.js):
// - what went wrong when this phone could not be set up for push,
// - when to (re)register or unregister this phone's token,
// - what a push that arrives while the app is open shows and opens.
// Device tokens never pass through here and are never logged.

export const NATIVE_PUSH_DIAGNOSTIC_KEY = "kunthai.nativePushDiagnostic";
export const NATIVE_PUSH_RECEIVED_EVENT = "kunthai-native-push-received";
// Android 8+ notification channel for every push. FCM uses it for pushes
// without a channel_id (AndroidManifest.xml default_notification_channel_id);
// high importance so Samsung / Android show them as heads-up alerts.
export const ANDROID_PUSH_CHANNEL = {
  id: "kunthai_alerts",
  name: "KunThai alerts",
  description: "Messages, activity and order updates",
  importance: 4,
  visibility: 0,
  vibration: true,
  lights: false,
};

// One channel per sound (Android fixes a channel's sound when it is first
// created, so each sound needs its own channel). The sound files live in
// android/app/src/main/res/raw and ios/App/App. send-native-push picks the
// channel and sound with the same kind mapping as pushSoundForKind below.
export const ANDROID_PUSH_CHANNELS = [
  ANDROID_PUSH_CHANNEL,
  {
    id: "kunthai_ride_requests",
    name: "UrRide ride requests",
    description: "New ride and delivery requests while you are an operator",
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: "#10B981",
    sound: "kt_ride_request.wav",
  },
  {
    id: "kunthai_messages",
    name: "Messages",
    description: "Explore and UrMall messages",
    importance: 4,
    visibility: 0,
    vibration: true,
    lights: false,
    sound: "kt_message.wav",
  },
  {
    id: "kunthai_orders",
    name: "Orders, bookings and trips",
    description: "UrMall orders and bookings, and UrRide trip updates",
    importance: 4,
    visibility: 0,
    vibration: true,
    lights: false,
    sound: "kt_order.wav",
  },
];

const PUSH_SOUNDS = {
  ride: { sound: "kt_ride_request.wav", channel: "kunthai_ride_requests" },
  message: { sound: "kt_message.wav", channel: "kunthai_messages" },
  order: { sound: "kt_order.wav", channel: "kunthai_orders" },
  default: { sound: "default", channel: ANDROID_PUSH_CHANNEL.id },
};

const PUSH_SOUND_BY_KIND = {
  urride_request: "ride",
  messages: "message",
  urmall_message: "message",
  orders: "order",
  urmall_order: "order",
  urmall_booking: "order",
  urride_trip: "order",
};

/** The sound file and Android channel a push of this kind uses (mirrors send-native-push). */
export function pushSoundForKind(kind = "") {
  return PUSH_SOUNDS[PUSH_SOUND_BY_KIND[text(kind).toLowerCase()] || "default"];
}

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

// FCM / APNs handed the app a token outside a registration (FCM rotated it).
// Save it only when this phone is already registered for this account and
// the token really changed.
export function shouldSaveRefreshedToken({ state = null, userId = "", token = "" } = {}) {
  const mine = ownState(state, userId);
  return Boolean(mine && text(token) && mine.token !== text(token));
}

// A token for log lines: its length only, never its characters.
export function tokenSummary(token = "") {
  return `token(${typeof token === "string" ? token.length : 0} chars)`;
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

// --- Notification taps ----------------------------------------------------------
// Every route a push (native or web) can carry, and what a tap opens. Unknown or
// incomplete routes fall back to a safe screen instead of doing nothing.
const URMALL_SCREENS = new Set(["messages", "orders", "business-messages", "business", "admin-roles"]);
const DUPLICATE_TAP_MS = 30_000;

// -> { route, kind, fallback, reason }. `kind` is safe to log (no ids).
export function pushTapRoute(route = "") {
  const value = normalizePushRoute(route);
  const fallbackTo = (to, reason) => ({ route: to, kind: to.split(":")[0], fallback: true, reason });
  if (!value) return fallbackTo("notifications", "missing route");
  const [kind, id = ""] = value.split(":");
  switch (kind) {
    case "conversation":
      return id ? { route: value, kind, fallback: false, reason: "" } : fallbackTo("messages", "conversation without id");
    case "messages":
    case "notifications":
    case "orders":
    case "urride":
      return { route: value, kind, fallback: false, reason: "" };
    case "urmall":
      return !id || URMALL_SCREENS.has(id)
        ? { route: value, kind: id ? `urmall:${id}` : "urmall", fallback: false, reason: "" }
        : fallbackTo("urmall", "unknown UrMall screen");
    default:
      return fallbackTo("notifications", "unknown route");
  }
}

// One tap can reach the app more than once (iOS / Android replay the launch
// tap to a late listener; a resumed app can deliver it again). Key: the
// notification's id, else its route.
export function pushTapKey(action) {
  const notification = action?.notification && typeof action.notification === "object" ? action.notification : {};
  const data = notification.data && typeof notification.data === "object" ? notification.data : {};
  const id = text(String(notification.id ?? "")) || text(String(data["google.message_id"] ?? "")) || text(String(data["gcm.message_id"] ?? ""));
  return id ? `id:${id}` : `route:${normalizePushRoute(text(data.route))}`;
}

// true when the same tap was already handled in the last 30 s; records it.
export function isDuplicateTap(recent, key, now = Date.now(), windowMs = DUPLICATE_TAP_MS) {
  if (!(recent instanceof Map) || !key) return false;
  for (const [seenKey, seenAt] of recent) if (now - seenAt > windowMs) recent.delete(seenKey);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
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
