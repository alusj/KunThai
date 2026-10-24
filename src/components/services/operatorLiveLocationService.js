import { Capacitor } from "@capacitor/core";

import supabase, { SUPABASE_API } from "../../Backend/lib/supabaseClient";
import { t } from "../../i18n";
import {
  GOOD_FIX_METERS,
  HEARTBEAT_INTERVAL_MS,
  acceptFix,
  chooseLocationEngine,
  describeBackgroundAccess,
  distanceInMeters,
  needsBackgroundConsentSheet,
  refineDue,
  shouldPublishFix,
} from "./operatorLocationPolicy";
import { getPreciseCurrentPosition } from "../../Backend/utils/precisePosition";
import { createNativeLocationSession } from "./operatorNativeLocationSession";
import { PRECISE_PURPOSE_OPERATOR, askPreciseIfApproximate, requestPreciseLocation } from "./preciseLocationAccess";

// Publishes the signed-in operator's live position into
// public.transport_operator_locations while they are online: on movement
// (12 m+, at most every 6 s otherwise), every 30 s as a heartbeat, and straight
// away when the app returns to the foreground. The Area View and "Available
// near you" read this table. RLS: operator_id must equal auth.uid().
//
// Two engines:
// - web (browser, or an app build without the native plugin): the WebView's
//   navigator.geolocation, exactly as before. Phones pause it in the background.
// - native (iOS / Android app): @capgo/background-geolocation keeps reporting
//   with the phone locked — on Android through a foreground service with a
//   "KunThai: you're online" notification, on iOS through the "location"
//   background mode. Permission is only requested when the operator switches
//   Active on or taps "Share location" (`interactive`), never at launch.

// Readable place for "Last seen near Lumley Beach Road" on passengers' cards.
// Looked up on this phone (the app's own reverse geocoder), at most when the
// operator moved PLACE_MOVE_METERS or every PLACE_REFRESH_MS, never on every
// publish; publishing never waits for it. Stored with the position in
// transport_operator_locations.metadata.place.
const PLACE_MOVE_METERS = 300;
const PLACE_REFRESH_MS = 5 * 60_000;
const PLACE_RETRY_MS = 60_000;
// A label from further away than this is wrong, so it is dropped when a new
// lookup fails.
const PLACE_STALE_METERS = 1000;

let activePublisher = null;

// When this device last saved a position successfully, for the operator
// dashboard's "Visible to passengers" line. Listeners are told on every
// successful publish and when sharing starts or stops (no polling).
let lastSuccessfulPublishAt = 0;
const publishListeners = new Set();

function publishStatusSnapshot() {
  return {
    running: Boolean(activePublisher),
    lastPublishedAt: lastSuccessfulPublishAt,
    // "native" | "web" | "" (not running)
    engine: activePublisher?.engine || "",
    // Native only: "background" | "foregroundOnly" | "denied" | "prompt" | "unknown"
    access: activePublisher?.engine === "native" ? activePublisher.access || "unknown" : "",
    // When this share started, and why it last failed: "permission" (location
    // refused), "gps" (no position from the phone), "write" (the database
    // refused the position) or "" (no failure since the last saved position).
    startedAt: activePublisher?.startedAt || 0,
    error: activePublisher?.errorKind || "",
    // Accuracy (m) of the position passengers see; null when unknown.
    accuracy: Number.isFinite(activePublisher?.lastAccuracy) ? activePublisher.lastAccuracy : null,
  };
}

function notifyPublishListeners() {
  const snapshot = publishStatusSnapshot();
  for (const listener of publishListeners) {
    try {
      listener(snapshot);
    } catch {
      // A broken listener must not stop publishing.
    }
  }
}

export function readOperatorPublishStatus() {
  return publishStatusSnapshot();
}

export function subscribeOperatorPublishStatus(listener) {
  if (typeof listener !== "function") return () => {};
  publishListeners.add(listener);
  return () => {
    publishListeners.delete(listener);
  };
}

// Set once the operator's device has given a position, so KunThai can resume
// publishing at launch without ever showing a surprise permission prompt.
const LOCATION_GRANTED_KEY = "kunthai.operatorLocationGranted.v1";
// Set once the "stay visible with your phone locked" sheet was answered.
const BACKGROUND_EXPLAINED_KEY = "kunthai.operatorBackgroundLocationExplained.v1";
// Set by passengerPosition.js once the WebView's own location worked.
const PASSENGER_LOCATION_GRANTED_KEY = "kunthai.locationGranted.v1";

function readFlag(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Storage unavailable: the dashboard still publishes while open.
  }
}

export function operatorLocationPreviouslyGranted() {
  return readFlag(LOCATION_GRANTED_KEY);
}

export function isOperatorLiveLocationRunning() {
  return Boolean(activePublisher);
}

// The operator's most recent GPS point this session ({ lat, lng }), kept after
// publishing stops so going offline can record where it happened.
let lastOperatorPoint = null;
let lastPublisherUserId = "";

export function readLastOperatorPoint() {
  return activePublisher?.lastPoint || lastOperatorPoint;
}

function normalizeAreaTransportType(fleetType = "") {
  const value = String(fleetType || "").toLowerCase();
  if (["motorcycle", "motorbike", "okada", "bike"].includes(value)) return "bike";
  if (["tricycle", "keke", "auto"].includes(value)) return "keke";
  if (["van", "bus", "minibus"].includes(value)) return "van";
  return "car";
}

function placeLookupDue(publisher, point, now) {
  if (publisher.placeInFlight) return false;
  const sinceAttempt = now - publisher.placeAttemptAt;
  if (!publisher.placeLabel) return sinceAttempt >= PLACE_RETRY_MS;
  const moved = distanceInMeters(publisher.placePoint, point);
  if (moved >= PLACE_MOVE_METERS) return sinceAttempt >= PLACE_RETRY_MS;
  return sinceAttempt >= PLACE_REFRESH_MS && moved >= 30;
}

function refreshPlaceLabel(publisher, point, now) {
  if (!point || !placeLookupDue(publisher, point, now)) return;
  publisher.placeInFlight = true;
  publisher.placeAttemptAt = now;
  import("../../Backend/services/locationSearchService")
    .then(({ reverseGeocodeLabel }) => reverseGeocodeLabel(point))
    .then((label) => {
      const clean = String(label || "").trim().slice(0, 120);
      if (clean) {
        publisher.placeLabel = clean;
        publisher.placePoint = point;
      } else if (publisher.placeLabel && distanceInMeters(publisher.placePoint, point) > PLACE_STALE_METERS) {
        publisher.placeLabel = "";
        publisher.placePoint = null;
      }
    })
    .catch(() => {
      // Keep the previous label; publishing is unaffected.
    })
    .finally(() => {
      publisher.placeInFlight = false;
    });
}

function fixAccuracy(position) {
  const value = position?.coords?.accuracy;
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

async function publishRow(publisher, position, { force = false } = {}) {
  const now = Date.now();
  const fresh = position
    ? { lat: position.coords.latitude, lng: position.coords.longitude }
    : null;
  // A rough network fix must not move a recently well-placed operator; the
  // heartbeat keeps the good position fresh instead.
  if (fresh && !acceptFix({ now, point: fresh, accuracy: fixAccuracy(position), lastGood: publisher.lastGoodFix })) return;
  if (fresh) {
    publisher.lastAccuracy = fixAccuracy(position);
    // Approximate location only (an operator resumed at launch was never
    // asked): ask for precise while KunThai is open.
    askPreciseIfApproximate(publisher.lastAccuracy, { purpose: PRECISE_PURPOSE_OPERATOR });
    if (publisher.lastAccuracy != null && publisher.lastAccuracy <= GOOD_FIX_METERS) {
      publisher.lastGoodFix = { point: fresh, accuracy: publisher.lastAccuracy, at: now };
    }
  }
  const point = fresh || publisher.lastPoint;
  if (!point) return;

  if (
    !shouldPublishFix({
      now,
      lastPublishedAt: publisher.lastPublishedAt,
      lastPublishedPoint: publisher.lastPublishedPoint,
      point,
      force,
    })
  ) {
    publisher.lastPoint = point;
    return;
  }

  publisher.lastPoint = point;
  lastOperatorPoint = point;
  publisher.lastPublishedPoint = point;
  publisher.lastPublishedAt = now;
  refreshPlaceLabel(publisher, point, now);

  const booked = Boolean(publisher.isBooked?.());
  const { error } = await supabase.from("transport_operator_locations").upsert(
    {
      operator_id: publisher.userId,
      display_name: publisher.displayName || "KunThai operator",
      transport_type: publisher.transportType,
      available: !booked,
      status: booked ? "busy" : "online",
      lat: point.lat,
      lng: point.lng,
      heading: Number.isFinite(position?.coords?.heading) ? position.coords.heading : null,
      speed_mps: Number.isFinite(position?.coords?.speed) ? position.coords.speed : null,
      // Heartbeats re-send the last fix, so they carry its accuracy too.
      accuracy_meters: position ? fixAccuracy(position) : publisher.lastAccuracy ?? null,
      last_seen_at: new Date(now).toISOString(),
      metadata: {
        booked,
        source: "operator_dashboard",
        // Read by operator_native_location_ping: a rough native fix near a
        // recent good one keeps the good position.
        ...(publisher.lastGoodFix ? { good_fix_at: new Date(publisher.lastGoodFix.at).toISOString() } : {}),
        ...(publisher.placeLabel ? { place: publisher.placeLabel } : {}),
      },
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "operator_id" },
  );
  if (error) {
    // Not saved, so passengers can't see this position: the dashboard says so
    // (sharing "error") instead of claiming the operator is visible. The next
    // fix or heartbeat tries again.
    publisher.lastError = error.message;
    publisher.lastPublishedAt = 0;
    if (activePublisher === publisher && publisher.errorKind !== "write") {
      publisher.errorKind = "write";
      notifyPublishListeners();
    }
    return;
  }
  publisher.lastError = "";
  publisher.errorKind = "";
  if (activePublisher === publisher) {
    lastSuccessfulPublishAt = now;
    notifyPublishListeners();
  }
}

function setPublisherError(publisher, kind) {
  if (activePublisher !== publisher || publisher.errorKind === kind) return;
  publisher.errorKind = kind;
  notifyPublishListeners();
}

// While KunThai is open, asks the phone for a precise GPS fix whenever the last
// one was rough (or on `force`: sharing started, app back in the foreground,
// "refresh" tapped) and publishes it. Both engines: the native watcher often
// hands over a network fix and then stays quiet while the operator is parked.
// Only once this device has given a position, so it never prompts.
// The app shares one location permission between the native watcher and the
// WebView only on Android; in the iOS app the WebView may ask on its own. So
// the native engine uses the WebView only once it is known to be allowed
// (KunThai already used it for Area View / "Locate me", or the browser says so).
async function webLocationAllowed(publisher) {
  if (publisher.engine === "web") return readFlag(LOCATION_GRANTED_KEY);
  // Android: the WebView uses the app's own location permission, which the
  // native watcher already has; its Permissions API still answers "prompt",
  // so asking it here kept the precise fix from ever running on Android.
  if (nativePlatform() === "android" && publisher.access !== "denied") return true;
  if (readFlag(PASSENGER_LOCATION_GRANTED_KEY)) return true;
  try {
    const status = await navigator.permissions?.query?.({ name: "geolocation" });
    return status?.state === "granted";
  } catch {
    return false;
  }
}

async function refinePosition(publisher, { force = false } = {}) {
  if (activePublisher !== publisher || publisher.refining) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  if (!readFlag(LOCATION_GRANTED_KEY)) return;
  const now = Date.now();
  if (!refineDue({ now, lastAccuracy: publisher.lastAccuracy, lastRefineAt: publisher.lastRefineAt, force })) return;
  publisher.refining = true;
  publisher.lastRefineAt = now;
  const allowed = await webLocationAllowed(publisher);
  if (!allowed || activePublisher !== publisher) {
    publisher.refining = false;
    return;
  }
  getPreciseCurrentPosition({ targetAccuracyMeters: 20, maxWaitMs: 10_000 })
    .then((position) => {
      if (activePublisher === publisher) return publishRow(publisher, position, { force: true });
      return undefined;
    })
    .catch(() => {
      // The watcher and heartbeat carry on with what they have.
    })
    .finally(() => {
      publisher.refining = false;
    });
}

// "Refresh my location" for the operator dashboard: a precise fix now.
export function refreshOperatorLocationNow() {
  if (activePublisher) refinePosition(activePublisher, { force: true });
}

// Native delivery: a token that only lets this phone's location plugin update
// this operator's position (supabase/migrations/20261021150000_*). Without a
// connection there is none, and the app shares from JavaScript as before.
const DELIVERY_TOKEN_WAIT_MS = 6000;
async function prepareNativeDelivery() {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ data: null }), DELIVERY_TOKEN_WAIT_MS);
  });
  const { data: token, error } = await Promise.race([supabase.rpc("start_operator_native_location"), timeout])
    .finally(() => clearTimeout(timer));
  if (error || typeof token !== "string" || !token) return null;
  return {
    url: `${SUPABASE_API.url.replace(/\/+$/, "")}/rest/v1/rpc/operator_native_location_ping`,
    headers: {
      apikey: SUPABASE_API.anonKey,
      Authorization: `Bearer ${SUPABASE_API.anonKey}`,
      "x-kunthai-location-token": token,
    },
  };
}

async function markOffline(userId) {
  if (!userId) return;
  // The background plugin's token goes too, so nothing can place this
  // operator after they went offline.
  supabase.rpc("stop_operator_native_location").then(() => {}, () => {});
  await supabase
    .from("transport_operator_locations")
    .update({
      status: "offline",
      available: false,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("operator_id", userId)
    .then(() => {}, () => {});
}

// ---------------------------------------------------------------------------
// Native background plugin

function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function nativePlatform() {
  try {
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
}

// The plugin is only used when the native project was synced with it
// (`npx cap sync`); an older app build keeps the web engine.
//
// The plugin object is a Capacitor proxy that answers every property, `then`
// included, with a native method wrapper. Resolving a promise with it makes
// the promise adopt it as a thenable that never settles, which froze the
// Active switch and the "Share location" button. So the promise resolves to a
// plain box ({ plugin }) and callers unwrap it.
let nativePluginPromise = null;
function loadNativePluginBox() {
  if (!isNativeApp()) return Promise.resolve({ plugin: null });
  if (!nativePluginPromise) {
    let available = false;
    try {
      available = Capacitor.isPluginAvailable("BackgroundGeolocation");
    } catch {
      available = false;
    }
    nativePluginPromise = available
      ? import("@capgo/background-geolocation").then(
          (module) => ({ plugin: module.BackgroundGeolocation || null }),
          () => ({ plugin: null }),
        )
      : Promise.resolve({ plugin: null });
  }
  return nativePluginPromise;
}

async function readNativeAccess(plugin) {
  try {
    const permissions = await plugin.checkPermissions();
    return describeBackgroundAccess({ platform: nativePlatform(), permissions });
  } catch {
    return "unknown";
  }
}

function refreshNativeAccess(publisher) {
  if (!publisher?.plugin) return;
  readNativeAccess(publisher.plugin).then((access) => {
    if (activePublisher !== publisher || publisher.access === access) return;
    publisher.access = access;
    notifyPublishListeners();
  });
}

function startNativeWatch(publisher, plugin, { interactive = false } = {}) {
  publisher.engine = "native";
  publisher.plugin = plugin;
  publisher.access = "unknown";

  publisher.nativeSession = createNativeLocationSession({
    plugin,
    platform: nativePlatform(),
    interactive,
    notificationTitle: t("urrideBackgroundLocation.notificationTitle"),
    notificationMessage: t("urrideBackgroundLocation.notificationMessage"),
    onLocation: (position) => {
      if (activePublisher !== publisher) return;
      writeFlag(LOCATION_GRANTED_KEY);
      publishRow(publisher, position);
    },
    // Denied, or location services off: the amber line offers Settings.
    onPermissionError: () => {
      setPublisherError(publisher, "permission");
      refreshNativeAccess(publisher);
    },
    onStartFailed: () => {
      // The plugin failed to start: share from the WebView instead, like before.
      if (activePublisher !== publisher || publisher.engine !== "native") return;
      if (typeof navigator === "undefined" || !navigator.geolocation) return;
      publisher.nativeSession?.stopHeartbeat();
      publisher.nativeSession = null;
      publisher.engine = "web";
      publisher.plugin = null;
      startWebWatch(publisher);
      notifyPublishListeners();
    },
    onSettled: () => {
      if (publisher.engine === "native") refreshNativeAccess(publisher);
    },
    prepareDelivery: prepareNativeDelivery,
    // Heartbeat with the last known fix. iOS keeps KunThai running while
    // location updates are on; timers may still be slowed in the background
    // (see docs/2026-10-15-urride-background-location.md).
    lastPublishedAt: () => publisher.lastPublishedAt,
    hasPoint: () => Boolean(publisher.lastPoint),
    beat: () => {
      if (activePublisher !== publisher) return;
      publishRow(publisher, null, { force: true });
      refinePosition(publisher);
    },
  });

  // Back in the foreground: check in now, and re-read the permission (the
  // operator may be coming back from Settings).
  publisher.onVisible = () => {
    if (document.visibilityState !== "visible" || activePublisher !== publisher) return;
    publishRow(publisher, null, { force: true });
    refinePosition(publisher, { force: true });
    if (publisher.engine === "native") refreshNativeAccess(publisher);
  };
  document.addEventListener("visibilitychange", publisher.onVisible);
}

// ---------------------------------------------------------------------------
// Web engine (unchanged behaviour)

function startWebWatch(publisher) {
  publisher.watchId = navigator.geolocation.watchPosition(
    (position) => {
      writeFlag(LOCATION_GRANTED_KEY);
      publishRow(publisher, position);
    },
    (positionError) => {
      // Denied: say so. Unavailable or timed out: only an error while no
      // position was ever received (the heartbeat keeps the last one fresh).
      if (positionError?.code === 1) setPublisherError(publisher, "permission");
      else if (!publisher.lastPoint) setPublisherError(publisher, "gps");
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );

  if (publisher.heartbeatId != null) window.clearInterval(publisher.heartbeatId);
  publisher.heartbeatId = window.setInterval(() => {
    publishRow(publisher, null, { force: true });
    refinePosition(publisher);
  }, HEARTBEAT_INTERVAL_MS);

  // Back from the background: send a fresh fix now instead of waiting for
  // the next movement or heartbeat, so passengers see an up-to-date position.
  if (publisher.onVisible) document.removeEventListener("visibilitychange", publisher.onVisible);
  publisher.onVisible = () => {
    if (document.visibilityState !== "visible" || activePublisher !== publisher) return;
    publishRow(publisher, null, { force: true });
    refinePosition(publisher, { force: true });
  };
  document.addEventListener("visibilitychange", publisher.onVisible);
}

// ---------------------------------------------------------------------------

// `interactive`: true only for an explicit tap (Active switched on, "Share
// location"); the native app may then show the system permission prompts.
// Resuming at launch / on the dashboard never prompts. The web engine
// behaves as before either way.
export async function startOperatorLiveLocation({
  displayName = "",
  fleetType = "",
  isBooked = () => false,
  interactive = false,
} = {}) {
  const native = isNativeApp();
  const hasWebGeolocation = typeof navigator !== "undefined" && Boolean(navigator.geolocation);
  if (!native && !hasWebGeolocation) return () => {};

  const { data } = await supabase.auth.getUser();
  const userId = data?.user?.id;
  if (!userId) return () => {};

  const plugin = native ? (await loadNativePluginBox()).plugin : null;
  const engine = chooseLocationEngine({ isNative: native, pluginAvailable: Boolean(plugin), hasWebGeolocation });
  if (engine === "none") return () => {};

  // Restarting for the same operator (Active switched on, "Share location",
  // app resumed) must not mark them offline: that write could land after the
  // new share's first position.
  stopOperatorLiveLocation({ markOffline: activePublisher?.userId !== userId });
  if (lastPublisherUserId !== userId) lastSuccessfulPublishAt = 0;
  lastPublisherUserId = userId;

  const publisher = {
    userId,
    displayName,
    transportType: normalizeAreaTransportType(fleetType),
    isBooked,
    engine,
    plugin: null,
    nativeSession: null,
    access: "",
    lastPoint: null,
    lastAccuracy: null,
    lastGoodFix: null,
    lastRefineAt: 0,
    refining: false,
    lastPublishedPoint: null,
    lastPublishedAt: 0,
    lastError: "",
    errorKind: "",
    startedAt: Date.now(),
    placeLabel: "",
    placePoint: null,
    placeAttemptAt: 0,
    placeInFlight: false,
    watchId: null,
    heartbeatId: null,
    onVisible: null,
  };
  activePublisher = publisher;

  if (engine === "native") startNativeWatch(publisher, plugin, { interactive });
  else startWebWatch(publisher);
  notifyPublishListeners();
  // A precise first fix (the first one a phone reports is often rough).
  // Delayed a little so a first-time permission prompt from the watcher comes first.
  window.setTimeout(() => refinePosition(publisher, { force: true }), 1500);
  // Switched Active on: a phone that only gives KunThai approximate location
  // (iOS Precise Location off, Android "Approximate") would place the operator
  // 1-3 km off whatever the GPS does, so it is asked for precise location
  // once the location permission itself is settled.
  if (interactive) {
    Promise.resolve(publisher.nativeSession?.started)
      .then(() => requestPreciseLocation({ purpose: PRECISE_PURPOSE_OPERATOR }))
      .then((status) => {
        if (status.accuracy === "full" && activePublisher === publisher) refinePosition(publisher, { force: true });
      })
      .catch(() => {});
  }

  return () => {
    if (activePublisher === publisher) stopOperatorLiveLocation();
  };
}

// `markOffline: false` only when a new share for the same operator replaces
// this one; otherwise the row is marked offline straight away.
export function stopOperatorLiveLocation({ markOffline: shouldMarkOffline = true } = {}) {
  const publisher = activePublisher;
  if (!publisher) return;
  activePublisher = null;
  if (publisher.watchId != null) navigator.geolocation?.clearWatch?.(publisher.watchId);
  if (publisher.heartbeatId != null) window.clearInterval(publisher.heartbeatId);
  if (publisher.onVisible) document.removeEventListener("visibilitychange", publisher.onVisible);
  publisher.nativeSession?.stop();
  if (shouldMarkOffline) markOffline(publisher.userId);
  notifyPublishListeners();
}

// Immediately reflect trip state (booked/empty) on the live marker.
export function syncOperatorLiveBookedState() {
  if (!activePublisher) return;
  publishRow(activePublisher, null, { force: true });
}

// ---------------------------------------------------------------------------
// "Stay visible with your phone locked" explanation (native app only)

let consentPresenter = null;

// OperatorPresenceHost registers the sheet; `present({ platform, resolve })`
// shows it and calls resolve("continue" | "later").
export function registerOperatorBackgroundConsentPresenter(present) {
  if (typeof present !== "function") return () => {};
  consentPresenter = present;
  return () => {
    if (consentPresenter === present) consentPresenter = null;
  };
}

// Called when the operator switches Active on. Resolves "skip" when nothing
// needs explaining (web, access already enough, denied, plugin missing) —
// start sharing as usual; "continue" — start with the permission prompts;
// "later" — go online without prompting.
export async function requestOperatorBackgroundConsent() {
  try {
    if (!isNativeApp() || !consentPresenter) return "skip";
    const { plugin } = await loadNativePluginBox();
    if (!plugin) return "skip";
    const permissions = await plugin.checkPermissions().catch(() => null);
    const platform = nativePlatform();
    const show = needsBackgroundConsentSheet({
      isNative: true,
      platform,
      permissions,
      explainedBefore: readFlag(BACKGROUND_EXPLAINED_KEY),
    });
    const present = consentPresenter;
    if (!show || !present) return "skip";
    const choice = await new Promise((resolve) => {
      present({ platform, resolve });
    });
    writeFlag(BACKGROUND_EXPLAINED_KEY);
    return choice === "later" ? "later" : "continue";
  } catch {
    return "skip";
  }
}

// App settings for KunThai (location "Always", notifications).
export async function openOperatorLocationSettings() {
  try {
    const { plugin } = await loadNativePluginBox();
    if (plugin) await plugin.openSettings();
  } catch {
    // Nothing else to open; the hint stays.
  }
}
