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
