// Pure helpers for UrRide live operator discovery ("Available near you").
// The database decides who is available (transport_available_operators_nearby:
// checked in within 2 minutes); these group the hydrated fleets, format the
// labels, decide when to fall back to the older list, and pace the refresh.

import { estimateTravelMinutes } from "./topRatedNearby.js";

// An operator counts as visible to passengers this long after a check-in.
export const LIVE_WINDOW_MS = 2 * 60 * 1000;
export const LIVE_REFRESH_INTERVAL_MS = 10_000;
export const LIVE_DEFAULT_RADIUS_KM = 15;

const VERIFIED_OR_PENDING = new Set(["verified", "recommended", "pending"]);

// The RPC is missing (migration not applied yet): PostgREST says PGRST202,
// Postgres says 42883 (undefined function). Anything else is a normal error.
export function isMissingRpcError(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (code === "PGRST202" || code === "42883") return true;
  const status = Number(error.status || error.statusCode || 0);
  return status === 404 && /function|rpc/i.test(String(error.message || error.hint || ""));
}

export function hasUsablePosition(position) {
  if (!position) return false;
  const latitude = Number(position.latitude);
  const longitude = Number(position.longitude);
  return (
    position.latitude !== null && position.latitude !== undefined && position.latitude !== "" &&
    position.longitude !== null && position.longitude !== undefined && position.longitude !== "" &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
  );
}

// "live" only with a known passenger position and an RPC that exists;
// otherwise the list behaves exactly as before ("legacy").
export function chooseDiscoveryMode({ position, rpcAvailable = true } = {}) {
  return rpcAvailable && hasUsablePosition(position) ? "live" : "legacy";
}

function minutesSince(timestamp, now) {
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(1, Math.floor(Math.max(0, now - time) / 60_000));
}

// Puts hydrated fleets in the database order and splits them into
// "available" (available + busy, nearest first) and "recent" (Active switch
// on, no check-in for over 2 minutes). Rows without a hydrated fleet (the
// client's safety filters removed it) are skipped. Unless includeUnverified,
// only verified and pending fleets are kept, mirroring the RPC.
export function groupLiveDiscovery(fleets = [], rows = [], { includeUnverified = false, now = Date.now() } = {}) {
  const byId = new Map((fleets || []).map((fleet) => [fleet?.id, fleet]));
  const available = [];
  const recent = [];
  const seen = new Set();

  for (const row of rows || []) {
    const fleet = byId.get(row?.fleet_id);
    if (!fleet || seen.has(fleet.id)) continue;
    if (!includeUnverified && !VERIFIED_OR_PENDING.has(fleet.verificationStatus)) continue;
    seen.add(fleet.id);

    const distanceKm = row.distance_km === null || row.distance_km === undefined ? null : Number(row.distance_km);
    const knownDistance = Number.isFinite(distanceKm) ? distanceKm : null;
    const rowEta = Number(row.eta_minutes);
    const availability = ["available", "busy", "recent"].includes(row.availability) ? row.availability : "recent";
    const item = {
      ...fleet,
      distanceKm: knownDistance,
      distanceSource: availability === "recent" ? "recent" : "live",
      etaMinutes: availability === "recent"
        ? null
        : (Number.isFinite(rowEta) && rowEta > 0 ? rowEta : estimateTravelMinutes(knownDistance, fleet.fleetType)),
      liveAvailability: availability,
      lastSeenAt: row.last_seen_at || null,
      lastSeenMinutes: row.last_seen_at ? minutesSince(row.last_seen_at, now) : null,
    };
    if (availability === "recent") recent.push(item);
    else available.push(item);
  }

  const byDistance = (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
  return { available: available.sort(byDistance), recent: recent.sort(byDistance) };
}

// "1.2" for the "{distance} km · {eta} min away" line; whole numbers stay whole.
export function formatDistanceKm(distanceKm) {
  const value = Number(distanceKm);
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(value) || value < 0) return "";
  return String(Math.round(value * 10) / 10);
}

// Interpolation values for the card labels, or null when nothing honest can
// be said (no distance / no last-seen time).
export function liveCardLabelValues(item) {
  if (!item) return null;
  if (item.liveAvailability === "recent") {
    return item.lastSeenMinutes ? { kind: "lastSeen", minutes: item.lastSeenMinutes } : null;
  }
  const distance = formatDistanceKm(item.distanceKm);
  if (!distance) return null;
  const eta = Number(item.etaMinutes);
  return { kind: "distanceEta", distance, eta: Number.isFinite(eta) && eta > 0 ? eta : 1 };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Realtime events arrive for operators everywhere; only ones near the
// passenger (or without coordinates, e.g. a delete) are worth a refresh.
export function isLocationChangeNearby(payload, position, radiusKm = LIVE_DEFAULT_RADIUS_KM) {
  if (!hasUsablePosition(position)) return false;
  const rows = [payload?.new, payload?.old].filter((row) => row && Object.keys(row).length);
  const placed = rows.filter((row) => hasUsablePosition({ latitude: row.lat, longitude: row.lng }));
  if (!placed.length) return true;
  const reach = Math.min(Math.max(Number(radiusKm) || LIVE_DEFAULT_RADIUS_KM, 1), 50) + 2;
  return placed.some((row) =>
    haversineKm(Number(position.latitude), Number(position.longitude), Number(row.lat), Number(row.lng)) <= reach,
  );
}

// A short signature so a refresh that changes nothing does not re-render.
export function liveDiscoverySignature(groups) {
  if (!groups) return "";
  const part = (items) => (items || [])
    .map((item) => `${item.id}:${item.liveAvailability}:${item.distanceKm}:${item.etaMinutes}:${item.lastSeenMinutes}`)
    .join("|");
  return `${part(groups.available)}#${part(groups.recent)}`;
}

// Operator dashboard: is this phone currently visible to passengers?
export function describeOperatorVisibility({ running = false, lastPublishedAt = 0, now = Date.now() } = {}) {
  const age = lastPublishedAt ? now - lastPublishedAt : Infinity;
  const visible = Boolean(running) && age >= 0 && age < LIVE_WINDOW_MS;
  return { visible, seconds: visible ? Math.max(0, Math.round(age / 1000)) : null };
}

// Runs `run` every `intervalMs` while `isVisible()` holds; never two runs at
// once (a request made during a run is folded into one follow-up run);
// `requestNow` ignores calls within `minGapMs` of the last start (realtime
// bursts), the timer catches up. Timers are injectable for tests.
export function createRefreshScheduler({
  run,
  intervalMs = LIVE_REFRESH_INTERVAL_MS,
  minGapMs = 0,
  isVisible = () => true,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  now = () => Date.now(),
} = {}) {
  let timer = null;
  let inFlight = null;
  let queued = false;
  let stopped = false;
  let lastStartedAt = -Infinity;

  function clear() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function schedule() {
    clear();
    if (stopped || !isVisible()) return;
    timer = setTimer(() => {
      timer = null;
      execute().finally(schedule);
    }, intervalMs);
  }

  function execute() {
    if (stopped) return Promise.resolve();
    if (inFlight) {
      queued = true;
      return inFlight;
    }
    lastStartedAt = now();
    inFlight = Promise.resolve()
      .then(() => run())
      .catch(() => {})
      .finally(() => {
        inFlight = null;
        if (queued && !stopped) {
          queued = false;
          return execute();
        }
        return undefined;
      });
    return inFlight;
  }

  return {
    start() {
      stopped = false;
      schedule();
    },
    requestNow() {
      if (stopped || !isVisible()) return Promise.resolve();
      if (now() - lastStartedAt < minGapMs) return Promise.resolve();
      return execute();
    },
    // Back in view: refresh at once, then keep the interval.
    resume() {
      if (stopped || !isVisible()) return;
      clear();
      execute().finally(schedule);
    },
    pause() {
      clear();
    },
    stop() {
      stopped = true;
      queued = false;
      clear();
    },
    isRunning() {
      return Boolean(inFlight);
    },
  };
}
