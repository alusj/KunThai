const NEARBY_VIEWBOX_RADIUS_DEGREES = 0.45;
const NEARBY_FALLBACK_RADIUS_METERS = 350_000;

function toFiniteCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function normalizeCenter(center) {
  const lat = toFiniteCoordinate(center?.lat ?? center?.latitude);
  const lng = toFiniteCoordinate(center?.lng ?? center?.longitude);
  if (lat == null || lng == null) return null;
  return {
    ...center,
    lat,
    lng,
    countryCode: String(center?.countryCode || center?.country_code || "").toLowerCase(),
  };
}

function buildNearbyViewbox(center, radius = NEARBY_VIEWBOX_RADIUS_DEGREES) {
  const normalizedCenter = normalizeCenter(center);
  if (!normalizedCenter) return "";

  const west = normalizedCenter.lng - radius;
  const north = normalizedCenter.lat + radius;
  const east = normalizedCenter.lng + radius;
  const south = normalizedCenter.lat - radius;

  return `${west},${north},${east},${south}`;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(pointA, pointB) {
  const start = normalizeCenter(pointA);
  const end = normalizeCenter(pointB);
  if (!start || !end) return null;

  const earthRadius = 6371000;
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLng = toRadians(end.lng - start.lng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) return "";
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m away`;
  return `${(distanceMeters / 1000).toFixed(distanceMeters >= 10_000 ? 0 : 1)} km away`;
}

function compactAddress(address = {}) {
  const primary = address.road || address.pedestrian || address.footway || address.neighbourhood || address.suburb;
  const city = address.city || address.town || address.village || address.municipality || address.county;
  const region = address.state || address.region;
  return [primary, city, region].filter(Boolean).join(", ");
}

function getPlaceName(place) {
  const address = place.address || {};
  return (
    place.namedetails?.name ||
    place.name ||
    address.amenity ||
    address.shop ||
    address.tourism ||
    address.building ||
    address.road ||
    address.neighbourhood ||
    address.suburb ||
    address.city ||
    address.town ||
    place.display_name ||
    "Location"
  );
}

function normalizePlace(place, center, source) {
  const lat = toFiniteCoordinate(place?.lat);
  const lng = toFiniteCoordinate(place?.lon ?? place?.lng);
  if (lat == null || lng == null) return null;

  const address = place.address || {};
  const countryCode = String(address.country_code || place.countryCode || "").toLowerCase();
  const distanceMeters = center ? distanceInMeters(center, { lat, lng }) : null;
  const shortAddress = compactAddress(address) || place.display_name || "";
  const name = getPlaceName(place);

  return {
    id: String(place.place_id || place.osm_id || `${lat},${lng}`),
    name,
    label: name,
    placeName: name,
    address: shortAddress,
    fullAddress: place.display_name || shortAddress,
    country: address.country || "",
    countryCode,
    category: place.type || place.class || "Location",
    lat,
    lng,
    distanceMeters,
    distance: formatDistance(distanceMeters),
    nearby: source === "nearby",
  };
}

function uniquePlaces(places = []) {
  const seen = new Set();
  return places.filter((place) => {
    const key = place?.id || `${place?.lat},${place?.lng}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortPlaces(places = [], searchText = "") {
  const query = searchText.toLowerCase();
  return [...places].sort((first, second) => {
    const firstName = String(first.name || "").toLowerCase();
    const secondName = String(second.name || "").toLowerCase();
    const firstExact = firstName === query ? 1 : firstName.startsWith(query) ? 0.5 : 0;
    const secondExact = secondName === query ? 1 : secondName.startsWith(query) ? 0.5 : 0;
    if (firstExact !== secondExact) return secondExact - firstExact;
    return Number(first.distanceMeters ?? Infinity) - Number(second.distanceMeters ?? Infinity);
  });
}

async function fetchNominatim(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Location search failed");
  }

  return response.json();
}

export async function searchLocations(query, center = null, options = {}) {
  const searchText = query?.trim();

  if (!searchText || searchText.length < 2) {
    return [];
  }

  try {
    const normalizedCenter = normalizeCenter(center);
    const viewbox = buildNearbyViewbox(normalizedCenter);
    const limit = Math.max(3, Math.min(12, Number(options.limit || 8)));
    const maxDistanceMeters = Number(options.maxDistanceMeters || NEARBY_FALLBACK_RADIUS_METERS);
    const centerCountryCode = String(options.countryCode || normalizedCenter?.countryCode || "").toLowerCase();
    const baseParams = `format=json&addressdetails=1&namedetails=1&limit=${limit}`;

    const nearbyUrl = viewbox
      ? `https://nominatim.openstreetmap.org/search?${baseParams}&bounded=1&viewbox=${encodeURIComponent(
          viewbox
        )}&q=${encodeURIComponent(searchText)}`
      : null;

    const globalUrl = `https://nominatim.openstreetmap.org/search?${baseParams}&q=${encodeURIComponent(searchText)}`;
    const nearbyData = nearbyUrl ? await fetchNominatim(nearbyUrl) : [];
    const needsFallback = !Array.isArray(nearbyData) || nearbyData.length < Math.min(4, limit);
    const fallbackData = needsFallback ? await fetchNominatim(globalUrl).catch(() => []) : [];
    const nearbyPlaces = (Array.isArray(nearbyData) ? nearbyData : [])
      .map((place) => normalizePlace(place, normalizedCenter, "nearby"))
      .filter(Boolean);
    const fallbackPlaces = (Array.isArray(fallbackData) ? fallbackData : [])
      .map((place) => normalizePlace(place, normalizedCenter, "global"))
      .filter(Boolean)
      .filter((place) => {
        if (!normalizedCenter) return true;
        if (centerCountryCode && place.countryCode && place.countryCode !== centerCountryCode) return false;
        return place.distanceMeters == null || place.distanceMeters <= maxDistanceMeters;
      });

    return sortPlaces(uniquePlaces([...nearbyPlaces, ...fallbackPlaces]), searchText).slice(0, limit);
  } catch {
    return [];
  }
}
