const NEARBY_VIEWBOX_RADIUS_DEGREES = 0.45;
const NEARBY_FALLBACK_RADIUS_METERS = 350_000;
const ADDRESS_STOP_WORDS = new Set([
  "street",
  "st",
  "road",
  "rd",
  "avenue",
  "ave",
  "lane",
  "ln",
  "drive",
  "dr",
  "close",
  "junction",
  "community",
  "town",
  "city",
]);

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

function cleanAddressText(value = "") {
  return String(value)
    .replace(/\s*,+\s*/g, ", ")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^,\s*|\s*,$/g, "")
    .trim();
}

function normalizeSearchText(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeAddressSegment(value = "") {
  return normalizeSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .filter((token) => !/^\d+[a-z]?$/.test(token))
    .filter((token) => !ADDRESS_STOP_WORDS.has(token));
}

function countTokenMatches(searchable, tokens = []) {
  if (!tokens.length) return 0;
  const padded = ` ${searchable} `;
  return tokens.filter((token) => padded.includes(` ${token} `)).length;
}

function buildAddressContext(searchText = "") {
  const cleaned = cleanAddressText(searchText);
  const segments = cleaned.split(",").map((segment) => segment.trim()).filter((segment) => segment.length >= 2);
  const streetTokens = tokenizeAddressSegment(segments[0] || cleaned);
  const communityTokens = tokenizeAddressSegment(segments[1] || "");
  const trailingTokens = segments.slice(1).flatMap(tokenizeAddressSegment);
  const cityCountryTokens = segments.slice(-2).flatMap(tokenizeAddressSegment);
  const allTokens = [...new Set(segments.flatMap(tokenizeAddressSegment))];

  return {
    cleaned,
    segments,
    streetTokens,
    communityTokens,
    trailingTokens: [...new Set(trailingTokens)],
    cityCountryTokens: [...new Set(cityCountryTokens)],
    allTokens,
    structured: segments.length > 1,
  };
}

function getSearchablePlaceText(place) {
  return normalizeSearchText([place.name, place.label, place.address, place.fullAddress, place.country].filter(Boolean).join(" "));
}

function scoreAddressMatch(place, context) {
  const searchable = getSearchablePlaceText(place);
  const allMatches = countTokenMatches(searchable, context.allTokens);
  const streetMatches = countTokenMatches(searchable, context.streetTokens);
  const communityMatches = countTokenMatches(searchable, context.communityTokens);
  const trailingMatches = countTokenMatches(searchable, context.trailingTokens);
  const cityCountryMatches = countTokenMatches(searchable, context.cityCountryTokens);
  const coverage = context.allTokens.length ? allMatches / context.allTokens.length : 0;
  const exactCleaned = normalizeSearchText(context.cleaned);

  let score =
    coverage * 4 +
    streetMatches * 2 +
    communityMatches * 7 +
    trailingMatches * 2.5 +
    cityCountryMatches * 1.5;

  if (exactCleaned && searchable.includes(exactCleaned)) score += 8;

  // Same street/area names can exist in different communities. If the typed
  // address includes a community, do not let a street-only match outrank the
  // community and city context.
  if (context.communityTokens.length && streetMatches > 0 && communityMatches === 0) {
    score -= 10;
  }

  if (context.structured && allMatches <= Math.max(1, streetMatches) && context.trailingTokens.length) {
    score -= 8;
  }

  return score;
}

function hasStrongAddressMatch(places = [], context) {
  if (!context.structured) return places.length > 0;
  return places.some((place) => {
    const searchable = getSearchablePlaceText(place);
    const streetMatches = countTokenMatches(searchable, context.streetTokens);
    const communityMatches = countTokenMatches(searchable, context.communityTokens);
    const trailingMatches = countTokenMatches(searchable, context.trailingTokens);
    const cityCountryMatches = countTokenMatches(searchable, context.cityCountryTokens);

    if (context.communityTokens.length) {
      return communityMatches > 0 && (streetMatches > 0 || cityCountryMatches > 0 || trailingMatches >= 2);
    }

    return trailingMatches >= Math.min(2, context.trailingTokens.length || 2) || streetMatches > 0;
  });
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

// A proximity boost that pulls nearby results toward the top without letting a
// close-but-irrelevant place outrank a strong textual match. It decays with
// distance: ~+3 within a few hundred metres, fading to ~0 by ~25 km.
function getProximityBoost(place) {
  const distanceMeters = Number(place.distanceMeters);
  if (!Number.isFinite(distanceMeters)) return 0;
  return 3 / (1 + distanceMeters / 2500);
}

function sortPlaces(places = [], searchText = "", distanceFirst = false) {
  const context = buildAddressContext(searchText);
  const query = normalizeSearchText(searchText);
  const queryTokens = context.allTokens.length ? context.allTokens : query.split(/\s+/).filter((token) => token.length > 1);
  const relevance = (place) => {
    const name = normalizeSearchText(place.name || "");
    const searchable = getSearchablePlaceText(place);
    const tokenMatches = queryTokens.filter((token) => ` ${searchable} `.includes(` ${token} `)).length;
    const coverage = queryTokens.length ? tokenMatches / queryTokens.length : 0;
    return (
      (name === query ? 4 : name.startsWith(query) ? 2 : searchable.includes(query) ? 1 : 0) +
      coverage +
      scoreAddressMatch(place, context)
    );
  };
  return [...places].sort((first, second) => {
    if (distanceFirst) {
      const distanceDelta = Number(first.distanceMeters ?? Infinity) - Number(second.distanceMeters ?? Infinity);
      if (distanceDelta !== 0) return distanceDelta;
    }
    // Blend relevance with proximity so the nearest suggestion rises to the top
    // among comparably-relevant matches, while an exact place-name match still
    // wins even when it is farther away.
    const firstScore = relevance(first) + getProximityBoost(first);
    const secondScore = relevance(second) + getProximityBoost(second);
    if (firstScore !== secondScore) return secondScore - firstScore;
    return Number(first.distanceMeters ?? Infinity) - Number(second.distanceMeters ?? Infinity);
  });
}

// A leading house number ("26a", "No. 5", "12-14") is dropped for searching:
// OpenStreetMap rarely maps house numbers in KunThai's markets, and searching
// on it pulled in same-named streets in other countries.
const HOUSE_NUMBER_PREFIX = /^\s*(?:no\.?\s*|#\s*)?\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?\b\s*,?\s*/i;

export function stripHouseNumber(text = "") {
  const segments = cleanAddressText(text).split(",").map((segment) => segment.trim());
  const first = segments[0] || "";
  const withoutNumber = first.replace(HOUSE_NUMBER_PREFIX, "").trim();
  if (!withoutNumber) return segments.slice(1).filter(Boolean).join(", ");
  return [withoutNumber, ...segments.slice(1)].filter(Boolean).join(", ");
}

// Fallback queries for full addresses. Every variant keeps the community, town
// and country the person typed; a street or number is never searched alone.
export function buildSearchVariants(searchText = "") {
  const normalized = cleanAddressText(searchText);
  const withoutNumber = stripHouseNumber(normalized);
  const segments = withoutNumber.split(",").map((segment) => segment.trim()).filter((segment) => segment.length >= 2);
  const variants = [normalized, withoutNumber];
  const withoutPostcode = withoutNumber.replace(/\b[A-Z]{0,2}\d{3,6}\b/gi, "").replace(/\s+,/g, ",").trim();
  if (withoutPostcode) variants.push(withoutPostcode);
  // "Street, Community, Town, Country" -> "Community, Town, Country".
  if (segments.length >= 3) variants.push(segments.slice(1).join(", "));
  return [...new Set(variants.filter(Boolean))].slice(0, 4);
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

// Photon (photon.komoot.io) is OpenStreetMap search built for type-ahead: it
// matches partial words ("Manf" -> "Manfred Lane") and ranks places near the
// given point first. Nominatim only matches whole words.
const PHOTON_URL = "https://photon.komoot.io/api/";

export function photonFeatureToPlace(feature, center) {
  const props = feature?.properties || {};
  const [lng, lat] = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates.map(Number) : [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const street = [props.housenumber, props.street].filter(Boolean).join(" ");
  const name = props.name || street || props.district || props.locality || props.city || props.county || "Location";
  const parts = [
    street && street !== name ? street : "",
    props.district || props.locality || "",
    props.city || props.county || "",
    props.state || "",
  ].filter((part, index, list) => part && part !== name && list.indexOf(part) === index);
  const shortAddress = parts.join(", ");
  const fullAddress = [name, ...parts, props.country].filter(Boolean).join(", ");
  const distanceMeters = center ? distanceInMeters(center, { lat, lng }) : null;

  return {
    id: `photon-${props.osm_type || ""}${props.osm_id || `${lat},${lng}`}`,
    name,
    label: name,
    placeName: name,
    address: shortAddress || fullAddress,
    fullAddress,
    country: props.country || "",
    countryCode: String(props.countrycode || "").toLowerCase(),
    category: props.osm_value || props.type || "Location",
    lat,
    lng,
    distanceMeters,
    distance: formatDistance(distanceMeters),
    nearby: Number.isFinite(distanceMeters) && distanceMeters <= NEARBY_VIEWBOX_RADIUS_DEGREES * 111_000,
  };
}

async function fetchPhoton(text, center, limit) {
  const params = new URLSearchParams({ q: text, limit: String(limit), lang: "en" });
  if (center) {
    params.set("lat", String(center.lat));
    params.set("lon", String(center.lng));
  }
  const response = await fetch(`${PHOTON_URL}?${params.toString()}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Location search failed");
  const data = await response.json();
  return (Array.isArray(data?.features) ? data.features : [])
    .map((feature) => photonFeatureToPlace(feature, center))
    .filter(Boolean);
}

// True when a result sits in the community / town / country the person typed
// (a single-part query always qualifies).
export function isStrongAddressMatch(place, searchText = "") {
  return hasStrongAddressMatch([place], buildAddressContext(stripHouseNumber(searchText)));
}

// Keeps the results that honour the typed context: the named country, the
// named community/town, the caller's country, and distance from the person.
function filterByContext(places, { searchText, center, countryCode, maxDistanceMeters }) {
  let kept = places.filter((place) => {
    if (countryCode && place.countryCode && place.countryCode !== countryCode) return false;
    if (center && Number.isFinite(place.distanceMeters) && place.distanceMeters > maxDistanceMeters) return false;
    return true;
  });

  const segments = cleanAddressText(searchText).split(",").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length > 1) {
    const typedCountry = normalizeSearchText(segments[segments.length - 1]);
    const inTypedCountry = kept.filter((place) => normalizeSearchText(place.country) === typedCountry);
    if (inTypedCountry.length) kept = inTypedCountry;

    const context = buildAddressContext(stripHouseNumber(searchText));
    const strong = kept.filter((place) => hasStrongAddressMatch([place], context));
    if (strong.length) kept = strong;
  }
  return kept;
}

export async function searchLocations(query, center = null, options = {}) {
  const searchText = String(query || "").trim();
  if (!searchText) return [];

  try {
    const normalizedCenter = normalizeCenter(center);
    const limit = Math.max(3, Math.min(12, Number(options.limit || 8)));
    const maxDistanceMeters = Number(options.maxDistanceMeters || NEARBY_FALLBACK_RADIUS_METERS);
    const countryCode = String(options.countryCode || normalizedCenter?.countryCode || "").toLowerCase();
    const filterOptions = { searchText, center: normalizedCenter, countryCode, maxDistanceMeters };
    const addressContext = buildAddressContext(stripHouseNumber(searchText));

    // 1. Type-ahead: works from the first letter.
    let collected = filterByContext(
      await fetchPhoton(searchText, normalizedCenter, Math.min(15, limit + 4)).catch(() => []),
      filterOptions,
    );

    // 2. Full addresses Photon could not place: Nominatim, keeping the typed
    //    community/town/country in every query (whole words, so 3+ letters).
    const needsFallback = searchText.length >= 3
      && (collected.length < Math.min(3, limit) || (addressContext.structured && !hasStrongAddressMatch(collected, addressContext)));
    if (needsFallback) {
      const countryParam = countryCode ? `&countrycodes=${encodeURIComponent(countryCode)}` : "";
      const baseParams = `format=json&addressdetails=1&namedetails=1&limit=${limit}${countryParam}`;
      const viewbox = buildNearbyViewbox(normalizedCenter);
      const variants = buildSearchVariants(searchText);
      let requests = 0;

      for (const variant of variants) {
        if (requests >= 3) break;
        const urls = [
          viewbox ? `https://nominatim.openstreetmap.org/search?${baseParams}&bounded=1&viewbox=${encodeURIComponent(viewbox)}&q=${encodeURIComponent(variant)}` : null,
          `https://nominatim.openstreetmap.org/search?${baseParams}&q=${encodeURIComponent(variant)}`,
        ].filter(Boolean);
        for (const url of urls) {
          if (requests >= 3) break;
          requests += 1;
          const data = await fetchNominatim(url).catch(() => []);
          const places = (Array.isArray(data) ? data : [])
            .map((place) => normalizePlace(place, normalizedCenter, url.includes("bounded=1") ? "nearby" : "global"))
            .filter(Boolean);
          collected = uniquePlaces([...collected, ...filterByContext(places, filterOptions)]);
          if (collected.length && hasStrongAddressMatch(collected, addressContext)) break;
        }
        if (collected.length && hasStrongAddressMatch(collected, addressContext)) break;
      }
    }

    return sortPlaces(uniquePlaces(collected), stripHouseNumber(searchText) || searchText, options.sortByDistance === true).slice(0, limit);
  } catch {
    return [];
  }
}

// The place to navigate to for a typed or saved address, or null. Only a
// result in the typed community / town / country (and near the person, when
// their position is known) qualifies; otherwise the caller shows the choices.
export async function resolveAddressLocation(query, center = null, options = {}) {
  const searchText = String(query || "").trim();
  const results = await searchLocations(searchText, center, { ...options, limit: options.limit || 8 });
  // Every typed word (house numbers and words like "street" aside) must appear
  // in the result, so "26a Grassfield" never auto-resolves to "Pump Station 260".
  const requiredTokens = tokenizeAddressSegment(stripHouseNumber(searchText));
  // Without the person's position, only an address that names its community,
  // town or country is specific enough to navigate to on its own.
  const hasContext = Boolean(normalizeCenter(center)) || buildAddressContext(stripHouseNumber(searchText)).structured;
  if (!hasContext) return { place: null, results };
  const place = results.find((result) => (
    isStrongAddressMatch(result, searchText)
    && countTokenMatches(getSearchablePlaceText(result), requiredTokens) === requiredTokens.length
  )) || null;
  return { place, results };
}
