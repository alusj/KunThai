function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function distanceInMeters(pointA, pointB) {
  if (!pointA || !pointB) return 0;
  const earthRadius = 6371000;
  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);
  const deltaLat = toRadians(pointB.lat - pointA.lat);
  const deltaLng = toRadians(pointB.lng - pointA.lng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatTripDistance(meters) {
  const distance = Math.max(0, Number(meters || 0));
  if (distance < 1000) return `${Math.round(distance)} m`;
  return `${(distance / 1000).toFixed(distance >= 10000 ? 1 : 2)} km`;
}

export function formatTripElapsed(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function getElapsedTripSeconds(trip, now = Date.now()) {
  if (!trip?.startedAt) return 0;
  const endAt = trip.pausedAt ? new Date(trip.pausedAt).getTime() : now;
  return Math.max(0, Math.round((endAt - new Date(trip.startedAt).getTime()) / 1000) - Number(trip.pausedSeconds || 0));
}
