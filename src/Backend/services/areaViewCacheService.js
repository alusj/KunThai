const AREA_VIEW_CACHE_KEY = "kunthai.areaView.cache.v2";
const POSITION_MAX_AGE_MS = 10 * 60 * 1000;
const AREA_DATA_MAX_AGE_MS = 3 * 60 * 1000;

function validPoint(point) {
  return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng));
}

function readRawCache() {
  if (typeof localStorage === "undefined") return {};
  try {
    const value = JSON.parse(localStorage.getItem(AREA_VIEW_CACHE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function readAreaViewCache() {
  const cache = readRawCache();
  const now = Date.now();
  const position = validPoint(cache.position) && now - Number(cache.positionSavedAt || 0) <= POSITION_MAX_AGE_MS
    ? cache.position
    : null;
  const dataFresh = now - Number(cache.dataSavedAt || 0) <= AREA_DATA_MAX_AGE_MS;

  return {
    position,
    locations: dataFresh && Array.isArray(cache.locations) ? cache.locations : [],
    operators: dataFresh && Array.isArray(cache.operators) ? cache.operators : [],
    reports: dataFresh && Array.isArray(cache.reports) ? cache.reports : [],
    traffic: dataFresh && Array.isArray(cache.traffic) ? cache.traffic : [],
    recentSearches: Array.isArray(cache.recentSearches) ? cache.recentSearches.slice(0, 20) : [],
    weather: dataFresh && cache.weather ? cache.weather : null,
  };
}

export function cacheAreaViewPosition(position) {
  if (!validPoint(position) || typeof localStorage === "undefined") return;
  try {
    const current = readRawCache();
    localStorage.setItem(AREA_VIEW_CACHE_KEY, JSON.stringify({
      ...current,
      position: {
        lat: Number(position.lat),
        lng: Number(position.lng),
        accuracy: Number(position.accuracy || position.accuracyMeters || 0) || null,
        heading: Number.isFinite(Number(position.heading)) ? Number(position.heading) : null,
        speed: Number.isFinite(Number(position.speed)) ? Number(position.speed) : null,
        label: position.label || "Cached current location",
      },
      positionSavedAt: Date.now(),
    }));
  } catch {
    // Area View remains fully usable when storage is unavailable or full.
  }
}

export function cacheAreaViewData(data = {}) {
  if (typeof localStorage === "undefined") return;
  try {
    const current = readRawCache();
    localStorage.setItem(AREA_VIEW_CACHE_KEY, JSON.stringify({
      ...current,
      locations: Array.isArray(data.locations) ? data.locations.slice(0, 160) : current.locations || [],
      operators: Array.isArray(data.operators) ? data.operators.slice(0, 120) : current.operators || [],
      reports: Array.isArray(data.reports) ? data.reports.slice(0, 120) : current.reports || [],
      traffic: Array.isArray(data.traffic) ? data.traffic.slice(0, 120) : current.traffic || [],
      recentSearches: Array.isArray(data.recentSearches) ? data.recentSearches.slice(0, 20) : current.recentSearches || [],
      weather: data.weather ?? current.weather ?? null,
      dataSavedAt: Date.now(),
    }));
  } catch {
    // Cache persistence is an enhancement, never a navigation dependency.
  }
}
