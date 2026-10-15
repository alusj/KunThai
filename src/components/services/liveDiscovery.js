// Pure helpers for UrRide live operator discovery ("Available near you").
// The database decides who is available (transport_available_operators_nearby:
// checked in within 2 minutes); these group the hydrated fleets, format the
// labels, decide when to fall back to the older list, and pace the refresh.

import { estimateTravelMinutes } from "./topRatedNearby.js";

// An operator counts as visible to passengers this long after a check-in.
export const LIVE_WINDOW_MS = 2 * 60 * 1000;
export const LIVE_REFRESH_INTERVAL_MS = 10_000;
export const LIVE_DEFAULT_RADIUS_KM = 15;

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

// Whole minutes since a timestamp (0 = under a minute), or null.
function minutesSince(timestamp, now) {
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor(Math.max(0, now - time) / 60_000);
}

function rowDistanceKm(row) {
  const metres = row.distance_m === null || row.distance_m === undefined || row.distance_m === "" ? NaN : Number(row.distance_m);
  if (Number.isFinite(metres) && metres >= 0) return metres / 1000;
  const km = row.distance_km === null || row.distance_km === undefined || row.distance_km === "" ? NaN : Number(row.distance_km);
  return Number.isFinite(km) && km >= 0 ? km : null;
}

// Puts hydrated fleets in the database order and splits them into
// "available" (available + busy, nearest first) and "recent" (Active switch
// on, no check-in for over 2 minutes). Rows without a hydrated fleet (the
// client's safety filters removed it) are skipped. Every verification state
// is kept, like every other passenger list.
export function groupLiveDiscovery(fleets = [], rows = [], { now = Date.now() } = {}) {
  const byId = new Map((fleets || []).map((fleet) => [fleet?.id, fleet]));
  const available = [];
  const recent = [];
  const seen = new Set();

  for (const row of rows || []) {
    const fleet = byId.get(row?.fleet_id);
    if (!fleet || seen.has(fleet.id)) continue;
    seen.add(fleet.id);

    const knownDistance = rowDistanceKm(row);
    const rowEta = Number(row.eta_minutes);
    const availability = ["available", "busy", "recent"].includes(row.availability) ? row.availability : "recent";
    const place = String(row.last_seen_place || "").trim();
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
      // Where the operator's phone last shared GPS (reverse geocoded on the
      // operator's side); never the fleet's registered city.
      lastSeenPlace: place,
    };
    if (availability === "recent") recent.push(item);
    else available.push(item);
  }

  const byDistance = (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
  return { available: available.sort(byDistance), recent: recent.sort(byDistance) };
}

// Professional distance: "850 m" under 1 km, "1.4 km" with one decimal,
// "12 km" from 10 km. Returns { unit: "m" | "km", value } or null.
export function formatLiveDistance(distanceKm) {
  if (distanceKm === null || distanceKm === undefined || distanceKm === "") return null;
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km < 0) return null;
  const metres = Math.round(km * 1000);
  if (metres < 1000) return { unit: "m", value: String(metres) };
  const oneDecimal = Math.round(km * 10) / 10;
  if (oneDecimal >= 10) return { unit: "km", value: String(Math.round(km)) };
  return { unit: "km", value: oneDecimal.toFixed(1) };
}

// "just now" / "3 min ago" / "2 h ago" / "1 h 20 min ago" as a key + values.
export function formatLastSeenAgo(minutes) {
  if (minutes === null || minutes === undefined || minutes === "") return null;
  const total = Math.floor(Number(minutes));
  if (!Number.isFinite(total) || total < 0) return null;
  if (total < 1) return { kind: "justNow" };
  if (total < 60) return { kind: "minutes", minutes: total };
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? { kind: "hoursMinutes", hours, minutes: rest } : { kind: "hours", hours };
}

// What the card says, or null when nothing honest can be said:
//   available / busy -> { kind: "distanceEta", distance, eta }
//   recent           -> { kind: "lastSeenNear", place, distance, ago }
//                       or { kind: "lastSeenAway", distance, ago } without a place
export function liveCardLabelValues(item) {
  if (!item) return null;
  const distance = formatLiveDistance(item.distanceKm);
  if (item.liveAvailability === "recent") {
    const ago = formatLastSeenAgo(item.lastSeenMinutes);
    if (!distance || !ago) return null;
    return item.lastSeenPlace
      ? { kind: "lastSeenNear", place: item.lastSeenPlace, distance, ago }
      : { kind: "lastSeenAway", distance, ago };
  }
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
    .map((item) => `${item.id}:${item.liveAvailability}:${item.distanceKm}:${item.etaMinutes}:${item.lastSeenMinutes}:${item.lastSeenPlace || ""}`)
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
