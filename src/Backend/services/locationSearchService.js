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
  const street = [address.house_number, address.road || address.pedestrian || address.footway].filter(Boolean).join(" ");
  const community = address.neighbourhood || address.quarter || address.suburb || address.hamlet || address.locality;
  const city = address.city || address.town || address.village || address.municipality || address.city_district || address.county;
  const region = address.state_district || address.state || address.region;
  return [street || community, street ? community : "", city, region].filter(Boolean).join(", ");
}

function getPlaceName(place) {
  const address = place.address || {};
  const streetAddress = [address.house_number, address.road || address.pedestrian || address.footway].filter(Boolean).join(" ");
  return (
    place.namedetails?.name ||
    place.namedetails?.["name:en"] ||
    place.namedetails?.alt_name ||
    streetAddress ||
    place.name ||
    address.amenity ||
    address.shop ||
    address.tourism ||
    address.building ||
    address.road ||
    address.neighbourhood ||
    address.quarter ||
    address.suburb ||
    address.hamlet ||
    address.locality ||
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

function sortPlaces(places = [], searchText = "", distanceFirst = false) {
  const query = searchText.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const queryTokens = query.split(/\s+/).filter((token) => token.length > 1);
  const relevance = (place) => {
    const name = String(place.name || "").toLowerCase();
    const searchable = [place.name, place.address, place.fullAddress].join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ");
    const tokenMatches = queryTokens.filter((token) => searchable.includes(token)).length;
    const coverage = queryTokens.length ? tokenMatches / queryTokens.length : 0;
    return (name === query ? 4 : name.startsWith(query) ? 2 : searchable.includes(query) ? 1 : 0) + coverage;
  };
  return [...places].sort((first, second) => {
    if (distanceFirst) {
      const distanceDelta = Number(first.distanceMeters ?? Infinity) - Number(second.distanceMeters ?? Infinity);
      if (distanceDelta !== 0) return distanceDelta;
    }
    const firstRelevance = relevance(first);
    const secondRelevance = relevance(second);
    if (firstRelevance !== secondRelevance) return secondRelevance - firstRelevance;
    return Number(first.distanceMeters ?? Infinity) - Number(second.distanceMeters ?? Infinity);
  });
}

function buildSearchVariants(searchText = "") {
  const normalized = String(searchText).replace(/\s+/g, " ").trim();
  const segments = normalized.split(",").map((segment) => segment.trim()).filter((segment) => segment.length >= 2);
  const variants = [normalized];

  if (segments.length > 1) {
    variants.push(segments.slice(0, -1).join(", "));
    variants.push(segments.slice(0, 2).join(", "));
    variants.push(segments[0]);
    variants.push(segments.slice(1).join(", "));
  }

  const withoutPostcode = normalized.replace(/\b[A-Z]{0,2}\d{3,6}\b/gi, "").replace(/\s+,/g, ",").trim();
  if (withoutPostcode && withoutPostcode !== normalized) variants.push(withoutPostcode);

  return [...new Set(variants.filter(Boolean))].slice(0, 5);
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
    const countryParam = centerCountryCode ? `&countrycodes=${encodeURIComponent(centerCountryCode)}` : "";
    const baseParams = `format=json&addressdetails=1&namedetails=1&limit=${limit}${countryParam}`;
    const variants = buildSearchVariants(searchText);
    let collected = [];

    const normalizeResults = (data, source) => (Array.isArray(data) ? data : [])
      .map((place) => normalizePlace(place, normalizedCenter, source))
      .filter(Boolean)
      .filter((place) => {
        if (!normalizedCenter || source === "nearby") return true;
        if (centerCountryCode && place.countryCode && place.countryCode !== centerCountryCode) return false;
        return place.distanceMeters == null || place.distanceMeters <= maxDistanceMeters;
      });

    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index];
      const nearbyUrl = viewbox
        ? `https://nominatim.openstreetmap.org/search?${baseParams}&bounded=1&viewbox=${encodeURIComponent(viewbox)}&q=${encodeURIComponent(variant)}`
        : null;
      const nearbyData = nearbyUrl ? await fetchNominatim(nearbyUrl).catch(() => []) : [];
      collected = uniquePlaces([...collected, ...normalizeResults(nearbyData, "nearby")]);

      if (collected.length < Math.min(4, limit)) {
        const globalUrl = `https://nominatim.openstreetmap.org/search?${baseParams}&q=${encodeURIComponent(variant)}`;
        const globalData = await fetchNominatim(globalUrl).catch(() => []);
        collected = uniquePlaces([...collected, ...normalizeResults(globalData, "global")]);
      }

      if (collected.length >= Math.min(4, limit)) break;
      if (index > 0 && collected.length > 0) break;
    }

    return sortPlaces(collected, searchText, options.sortByDistance === true).slice(0, limit);
  } catch {
    return [];
  }
}
