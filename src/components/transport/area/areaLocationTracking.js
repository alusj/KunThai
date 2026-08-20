const EARTH_RADIUS_METERS = 6_371_000;

export const AREA_LOCATION_ACCURACY = {
  firstFixMaxMeters: 5_000,
  trackingMaxMeters: 500,
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
