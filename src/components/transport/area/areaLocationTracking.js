const EARTH_RADIUS_METERS = 6_371_000;

export const AREA_LOCATION_ACCURACY = {
  firstFixMaxMeters: 5_000,
  trackingMaxMeters: 500,
};

export const AREA_LOCATION_MOTION = {
  minDurationMs: 360,
  maxDurationMs: 1_400,
  // Span the full expected gap between GPS fixes (rather than 90% of it) so the
  // marker is still gliding when the next fix arrives and is re-targeted, with
  // no frozen slice at the tail that reads as a stop-start jump.
  intervalCoverage: 1,
};

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function isPoint(value) {
  return Number.isFinite(Number(value?.lat)) && Number.isFinite(Number(value?.lng));
}

export function areaLocationDistanceMeters(from, to) {
  if (!isPoint(from) || !isPoint(to)) return Infinity;

  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const deltaLat = toLat - fromLat;
  const deltaLng = toRadians(to.lng) - toRadians(from.lng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function shouldAcceptAreaLocationAccuracy(accuracy, { hasLiveFix = false } = {}) {
  const meters = Number(accuracy);
  if (!Number.isFinite(meters) || meters < 0) return false;

  return meters <= (
    hasLiveFix
      ? AREA_LOCATION_ACCURACY.trackingMaxMeters
      : AREA_LOCATION_ACCURACY.firstFixMaxMeters
  );
}

export function getAreaLocationMotionDuration(elapsedMs = 1_000, distanceMeters = 0) {
  const safeElapsedMs = Number.isFinite(Number(elapsedMs))
    ? Math.max(0, Number(elapsedMs))
    : 1_000;
  const safeDistanceMeters = Number.isFinite(Number(distanceMeters))
    ? Math.max(0, Number(distanceMeters))
    : 0;
  const intervalDuration = safeElapsedMs * AREA_LOCATION_MOTION.intervalCoverage;
  const distanceFloor = safeDistanceMeters >= 35
    ? 700
    : safeDistanceMeters >= 12
      ? 600
      : safeDistanceMeters >= 2
        ? 480
        : AREA_LOCATION_MOTION.minDurationMs;

  return Math.round(Math.min(
    AREA_LOCATION_MOTION.maxDurationMs,
    Math.max(AREA_LOCATION_MOTION.minDurationMs, distanceFloor, intervalDuration),
  ));
}

export function isImplausibleAreaLocationJump(
  previous,
  next,
  {
    hasLiveFix = false,
    elapsedMs = 1_000,
    jumpDistanceMeters = 90,
    maxSpeedMetersPerSecond = 55,
  } = {},
) {
  // A cached/default marker is a visual fallback, not a GPS observation. The
  // first real device fix must always be allowed to replace it.
  if (!hasLiveFix || !isPoint(previous) || !isPoint(next)) return false;

  const distance = areaLocationDistanceMeters(previous, next);
  const previousAccuracy = Math.max(0, Number(previous.accuracy || 0));
  const nextAccuracy = Math.max(0, Number(next.accuracy || 0));
  const uncertaintyMeters = Math.max(previousAccuracy, nextAccuracy) * 1.5;
  const meaningfulJumpMeters = Math.max(jumpDistanceMeters, uncertaintyMeters);
  const seconds = Math.max(Number(elapsedMs) / 1_000, 1);

  return distance > meaningfulJumpMeters && distance / seconds > maxSpeedMetersPerSecond;
}

// --- Course-up camera helpers -------------------------------------------------
// The camera should turn with the traveller and keep their icon on screen.
// These are the pure pieces of that behaviour, kept here so they can be
// reasoned about (and tested) without a live map.

export function normalizeBearing(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return ((Number(value) % 360) + 360) % 360;
}

// Signed shortest turn from one bearing to another, in [-180, 180).
export function shortestBearingDelta(from, to) {
  return ((((Number(to) - Number(from)) % 360) + 540) % 360) - 180;
}

// Circular interpolation. Smoothing bearings arithmetically would swing the
// camera the long way round every time a heading crosses north.
export function smoothBearing(previous, next, weight) {
  const target = normalizeBearing(next);
  if (target == null) return previous ?? null;
  if (previous == null) return target;
  return normalizeBearing(previous + shortestBearingDelta(previous, target) * weight);
}

// True when a screen point has left the safe box — the viewport inset by
// `insetRatio` on every side — including when it is fully off screen.
export function isPointOutsideSafeBox(point, viewport, insetRatio) {
  const width = Number(viewport?.width) || 0;
  const height = Number(viewport?.height) || 0;
  if (!width || !height) return false;
  if (!Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y))) return false;

  const ratio = Math.min(Math.max(Number(insetRatio) || 0, 0), 0.49);
  const insetX = width * ratio;
  const insetY = height * ratio;

  return (
    point.x < insetX ||
    point.x > width - insetX ||
    point.y < insetY ||
    point.y > height - insetY
  );
}

// The edge-recovery camera is useful during normal travel, but must stand down
// while the map centre represents a pin the user is positioning. GPS can keep
// updating the traveller marker without taking ownership of the camera back.
export function shouldAllowTravellerCameraRecovery({
  pinSelectionActive = false,
  viewTargetActive = false,
  hasOperatorRoutePlan = false,
  smartCameraEnabled = true,
  userInteracting = false,
  // Pulling the camera back is for travel. Someone standing still who looked
  // elsewhere (a search, a pan, the fleets view) keeps that view and uses the
  // locate button to come back.
  travellerMoving = true,
} = {}) {
  return !(
    pinSelectionActive ||
    viewTargetActive ||
    hasOperatorRoutePlan ||
    !smartCameraEnabled ||
    userInteracting ||
    !travellerMoving
  );
}

// GPS speed spikes on a single noisy fix while standing still, so the camera
// only treats the traveller as moving after consecutive moving fixes.
export const AREA_MOVEMENT = {
  sustainedFixes: 2,
  // A destination picked while standing still is previewed; the camera only
  // goes back to following once the traveller has really left that spot.
  previewReleaseMeters: 30,
};

export function nextMovingStreak(streak = 0, moving = false) {
  return moving ? Math.min((Number(streak) || 0) + 1, 1_000) : 0;
}

export function isSustainedMovement(streak = 0) {
  return (Number(streak) || 0) >= AREA_MOVEMENT.sustainedFixes;
}

export function shouldReleaseRoutePreview({ anchor, position, sustainedMoving = false } = {}) {
  if (!sustainedMoving) return false;
  if (!isPoint(anchor)) return true;
  return areaLocationDistanceMeters(anchor, position) >= AREA_MOVEMENT.previewReleaseMeters;
}

// What the route card should show for the traveller's distance from the
// route. Being off the drawn route is not "wrong" by itself: another road may
// lead there too, so it reads as "checking" while a new route is worked out
// from where they are, and only turns "wrong" when no route could be found.
export function displayedRouteStatus(rawStatus, { rerouteFailed = false } = {}) {
  if (rawStatus !== "wrong") return rawStatus;
  return rerouteFailed ? "wrong" : "checking";
}

// A first GPS response can arrive after the user has already dragged the map.
// Once that gesture releases follow-lock, the late response must update only
// the traveller marker and leave the chosen map centre untouched.
export function shouldAutoCenterInitialAreaLocation({
  viewTargetActive = false,
  followLockActive = true,
} = {}) {
  return !viewTargetActive && followLockActive;
}

// ---- Riding the route line (2026-10-20) -----------------------------------
//
// While navigating, the traveller's icon is shown on the drawn route. Two
// things made it look slow and slightly off the road:
//  1. it glided in a straight line between two points on the route, cutting
//     every bend;
//  2. each GPS fix is already ~1 s old and the icon then spends the whole gap
//     to the next fix getting there, so it trailed the traveller.
// The icon now glides ALONG the route between the two points, and while the
// traveller is moving it is led a short way ahead (speed x the fix interval,
// capped), so it is where the traveller is now when the next fix arrives.

export const AREA_ROUTE_MOTION = {
  // Below this speed (~5 km/h) there is no lead: walking pace GPS noise would
  // push the icon ahead of a person who stopped.
  leadMinSpeedMps: 1.4,
  // Share of the travelled distance per fix interval used as lead.
  leadShare: 0.85,
  // Never lead more than this far.
  leadMaxMeters: 22,
  // A start this far from the line is not "on the route": glide straight.
  onRouteToleranceMeters: 4,
  // More route vertices than this between two fixes: a jump, glide straight.
  maxPathVertices: 40,
};

function toLatLng(coord) {
  if (Array.isArray(coord)) return { lng: Number(coord[0]), lat: Number(coord[1]) };
  return { lat: Number(coord?.lat), lng: Number(coord?.lng) };
}

/** How far ahead of the last fix to show a moving traveller, in metres. */
export function routeLeadMeters({ speedMps = 0, elapsedMs = 1_000 } = {}) {
  const speed = Number(speedMps);
  if (!Number.isFinite(speed) || speed < AREA_ROUTE_MOTION.leadMinSpeedMps) return 0;
  const seconds = Math.min(Math.max(Number(elapsedMs) || 1_000, 300), 1_600) / 1_000;
  return Math.min(AREA_ROUTE_MOTION.leadMaxMeters, speed * seconds * AREA_ROUTE_MOTION.leadShare);
}

/**
 * The point `meters` further along the route from a projected position
 * ({ point, segmentIndex }). Stops at the route's end.
 */
export function advanceAlongRoute(coordinates = [], from, meters = 0) {
  if (!from?.point || !Number.isInteger(from.segmentIndex) || coordinates.length < 2) return from || null;
  let remaining = Math.max(0, Number(meters) || 0);
  let current = from.point;
  for (let index = from.segmentIndex; index < coordinates.length - 1; index += 1) {
    const end = toLatLng(coordinates[index + 1]);
    const length = areaLocationDistanceMeters(current, end);
    if (!Number.isFinite(length)) break;
    if (remaining <= length) {
      const share = length ? remaining / length : 0;
      return {
        point: { lat: current.lat + (end.lat - current.lat) * share, lng: current.lng + (end.lng - current.lng) * share },
        segmentIndex: index,
      };
    }
    remaining -= length;
    current = end;
  }
  return { point: current, segmentIndex: coordinates.length - 2 };
}

/**
 * The route between two projected positions as a list of points (start, the
 * route's own corners, end), or null when they are not in order on the route
 * or too far apart to be one step.
 */
export function routePathBetween(coordinates = [], from, to) {
  if (!from?.point || !to?.point || !Number.isInteger(from.segmentIndex) || !Number.isInteger(to.segmentIndex)) return null;
  if (to.segmentIndex < from.segmentIndex) return null;
  if (to.segmentIndex - from.segmentIndex > AREA_ROUTE_MOTION.maxPathVertices) return null;
  const path = [from.point];
  for (let index = from.segmentIndex + 1; index <= to.segmentIndex; index += 1) {
    path.push(toLatLng(coordinates[index]));
  }
  path.push(to.point);
  return path;
}

/** The point at `fraction` (0-1) of a path's length, measured along it. */
export function pointAlongPath(path = [], fraction = 1) {
  if (!path.length) return null;
  if (path.length === 1) return path[0];
  const lengths = [];
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const length = areaLocationDistanceMeters(path[index], path[index + 1]);
    lengths.push(Number.isFinite(length) ? length : 0);
    total += lengths[index];
  }
  if (!total) return path[path.length - 1];
  let target = Math.min(1, Math.max(0, Number(fraction) || 0)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (target <= lengths[index] || index === lengths.length - 1) {
      const share = lengths[index] ? Math.min(1, target / lengths[index]) : 1;
      const a = path[index];
      const b = path[index + 1];
      return { lat: a.lat + (b.lat - a.lat) * share, lng: a.lng + (b.lng - a.lng) * share };
    }
    target -= lengths[index];
  }
  return path[path.length - 1];
}
