// Coordinate checks for the Nearby Area map. MapLibre throws on any point it
// cannot place (NaN, a latitude outside ±90, an empty or inverted bounds box),
// and a throw inside a map effect takes the whole screen down. Every marker
// position, camera target and bounds box goes through these first.

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// { lat, lng } with numeric, in-range values, or null. Accepts the shapes the
// area data uses: { lat, lng }, { latitude, longitude } and [lng, lat].
export function toMapPoint(value) {
  if (!value) return null;
  let lat;
  let lng;
  if (Array.isArray(value)) {
    lng = toFiniteNumber(value[0]);
    lat = toFiniteNumber(value[1]);
  } else if (typeof value === "object") {
    lat = toFiniteNumber(value.lat ?? value.latitude);
    lng = toFiniteNumber(value.lng ?? value.lon ?? value.longitude);
  } else {
    return null;
  }
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function isMapPoint(value) {
  return Boolean(toMapPoint(value));
}

// The same object with numeric lat/lng, or null when it cannot be placed.
export function withMapPoint(value) {
  const point = toMapPoint(value);
  if (!point) return null;
  return Array.isArray(value) ? point : { ...value, lat: point.lat, lng: point.lng };
}

// [lng, lat] for MapLibre, or null.
export function toLngLatArray(value) {
  const point = toMapPoint(value);
  return point ? [point.lng, point.lat] : null;
}

// [[west, south], [east, north]] around every placeable point, or null when
// fewer than one point can be placed. A single point gets a small box so
// fitBounds still has an area to show.
export function boundsAroundPoints(points = []) {
  const valid = (Array.isArray(points) ? points : []).map(toMapPoint).filter(Boolean);
  if (!valid.length) return null;
  const lngs = valid.map((point) => point.lng);
  const lats = valid.map((point) => point.lat);
  let west = Math.min(...lngs);
  let east = Math.max(...lngs);
  let south = Math.min(...lats);
  let north = Math.max(...lats);
  if (east - west < 0.0005) {
    west = Math.max(-180, west - 0.002);
    east = Math.min(180, east + 0.002);
  }
  if (north - south < 0.0005) {
    south = Math.max(-90, south - 0.002);
    north = Math.min(90, north + 0.002);
  }
  return [[west, south], [east, north]];
}

// A [[w, s], [e, n]] box MapLibre can fit, rebuilt from its corners, or null.
export function toMapBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 2) return null;
  const southWest = toMapPoint(bounds[0]);
  const northEast = toMapPoint(bounds[1]);
  if (!southWest || !northEast) return null;
  return boundsAroundPoints([southWest, northEast]);
}
