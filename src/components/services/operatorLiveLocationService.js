import supabase from "../../Backend/lib/supabaseClient";

// Publishes the signed-in operator's live position into
// public.transport_operator_locations while they are online: on movement
// (12 m+), every 30 s as a heartbeat, and straight away when the app returns
// to the foreground (phones pause timers in the background). The Area View
// reads this table (getLiveOperators + realtime) to show moving operators with
// an AVAILABLE / BOOKED badge. RLS: operator_id must equal auth.uid().

const MIN_PUBLISH_INTERVAL_MS = 6000;
// Passengers count an operator as available for 2 minutes after a check-in
// (transport_available_operators_nearby), so 30 s survives missed beats.
const HEARTBEAT_INTERVAL_MS = 30_000;
const MIN_MOVE_METERS = 12;

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
  return { running: Boolean(activePublisher), lastPublishedAt: lastSuccessfulPublishAt };
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

export function operatorLocationPreviouslyGranted() {
  try {
    return localStorage.getItem(LOCATION_GRANTED_KEY) === "1";
  } catch {
    return false;
  }
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

function distanceInMeters(a, b) {
  if (!a || !b) return Infinity;
  const earthRadius = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
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

async function publishRow(publisher, position, { force = false } = {}) {
  const now = Date.now();
  const point = position
    ? { lat: position.coords.latitude, lng: position.coords.longitude }
    : publisher.lastPoint;
  if (!point) return;

  const moved = distanceInMeters(publisher.lastPublishedPoint, point);
  if (!force && now - publisher.lastPublishedAt < MIN_PUBLISH_INTERVAL_MS && moved < MIN_MOVE_METERS) {
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
      accuracy_meters: Number.isFinite(position?.coords?.accuracy) ? position.coords.accuracy : null,
      last_seen_at: new Date(now).toISOString(),
      metadata: {
        booked,
        source: "operator_dashboard",
        ...(publisher.placeLabel ? { place: publisher.placeLabel } : {}),
      },
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "operator_id" },
  );
  if (error) {
    // Live positioning is best-effort; the fleet stays bookable without it.
    publisher.lastError = error.message;
    return;
  }
  publisher.lastError = "";
  if (activePublisher === publisher) {
    lastSuccessfulPublishAt = now;
    notifyPublishListeners();
  }
}

async function markOffline(userId) {
  if (!userId) return;
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

export async function startOperatorLiveLocation({ displayName = "", fleetType = "", isBooked = () => false } = {}) {
  if (typeof navigator === "undefined" || !navigator.geolocation) return () => {};

  const { data } = await supabase.auth.getUser();
  const userId = data?.user?.id;
  if (!userId) return () => {};

  stopOperatorLiveLocation();
  if (lastPublisherUserId !== userId) lastSuccessfulPublishAt = 0;
  lastPublisherUserId = userId;

  const publisher = {
    userId,
    displayName,
    transportType: normalizeAreaTransportType(fleetType),
    isBooked,
    lastPoint: null,
    lastPublishedPoint: null,
    lastPublishedAt: 0,
    lastError: "",
    placeLabel: "",
    placePoint: null,
    placeAttemptAt: 0,
    placeInFlight: false,
    watchId: null,
    heartbeatId: null,
    onVisible: null,
  };
  activePublisher = publisher;
  notifyPublishListeners();

  publisher.watchId = navigator.geolocation.watchPosition(
    (position) => {
      try {
        localStorage.setItem(LOCATION_GRANTED_KEY, "1");
      } catch {
        // Storage unavailable: the dashboard still publishes while open.
      }
      publishRow(publisher, position);
    },
    () => {
      // Position denied or unavailable: the heartbeat keeps the last point fresh.
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );

  publisher.heartbeatId = window.setInterval(() => publishRow(publisher, null, { force: true }), HEARTBEAT_INTERVAL_MS);

  // Back from the background: send a fresh fix now instead of waiting for
  // the next movement or heartbeat, so passengers see an up-to-date position.
  publisher.onVisible = () => {
    if (document.visibilityState !== "visible" || activePublisher !== publisher) return;
    navigator.geolocation.getCurrentPosition(
      (position) => publishRow(publisher, position, { force: true }),
      () => publishRow(publisher, null, { force: true }),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 15_000 },
    );
  };
  document.addEventListener("visibilitychange", publisher.onVisible);

  return () => {
    if (activePublisher === publisher) stopOperatorLiveLocation();
  };
}

export function stopOperatorLiveLocation() {
  const publisher = activePublisher;
  if (!publisher) return;
  activePublisher = null;
  if (publisher.watchId != null) navigator.geolocation?.clearWatch?.(publisher.watchId);
  if (publisher.heartbeatId != null) window.clearInterval(publisher.heartbeatId);
  if (publisher.onVisible) document.removeEventListener("visibilitychange", publisher.onVisible);
  markOffline(publisher.userId);
  notifyPublishListeners();
}

// Immediately reflect trip state (booked/empty) on the live marker.
export function syncOperatorLiveBookedState() {
  if (!activePublisher) return;
  publishRow(activePublisher, null, { force: true });
}
