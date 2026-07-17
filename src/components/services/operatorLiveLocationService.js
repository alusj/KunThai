import supabase from "../../Backend/lib/supabaseClient";

// Publishes the signed-in operator's live position into
// public.transport_operator_locations while they are online. The Area View
// reads this table (getLiveOperators + realtime) to show moving operators with
// an AVAILABLE / BOOKED badge. RLS: operator_id must equal auth.uid().

const MIN_PUBLISH_INTERVAL_MS = 6000;
const HEARTBEAT_INTERVAL_MS = 60_000;
const MIN_MOVE_METERS = 12;

let activePublisher = null;

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
  publisher.lastPublishedPoint = point;
  publisher.lastPublishedAt = now;

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
      metadata: { booked, source: "operator_dashboard" },
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "operator_id" },
  );
  if (error) {
    // Live positioning is best-effort; the fleet stays bookable without it.
    publisher.lastError = error.message;
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

  const publisher = {
    userId,
    displayName,
    transportType: normalizeAreaTransportType(fleetType),
    isBooked,
    lastPoint: null,
    lastPublishedPoint: null,
    lastPublishedAt: 0,
    lastError: "",
    watchId: null,
    heartbeatId: null,
  };
  activePublisher = publisher;

  publisher.watchId = navigator.geolocation.watchPosition(
    (position) => publishRow(publisher, position),
    () => {
      // Position denied or unavailable: the heartbeat keeps the last point fresh.
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );

  publisher.heartbeatId = window.setInterval(() => publishRow(publisher, null, { force: true }), HEARTBEAT_INTERVAL_MS);

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
  markOffline(publisher.userId);
}

// Immediately reflect trip state (booked/empty) on the live marker.
export function syncOperatorLiveBookedState() {
  if (!activePublisher) return;
  publishRow(activePublisher, null, { force: true });
}
