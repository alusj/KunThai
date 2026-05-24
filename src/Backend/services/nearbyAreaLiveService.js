import supabase from "../lib/supabaseClient";

const OPERATOR_STALE_MINUTES = 10;
const ACTIVE_OPERATOR_WINDOW_MS = OPERATOR_STALE_MINUTES * 60 * 1000;
const LIVE_REFRESH_DEBOUNCE_MS = 450;

const TRANSPORT_TYPES = new Set(["bike", "keke", "car", "van"]);
const TRAFFIC_STATUSES = new Set(["green", "yellow", "red"]);
const ACTIVE_REPORT_TYPES = new Set([
  "accident",
  "road_block",
  "flooding",
  "police_checkpoint",
  "traffic",
  "bad_road",
  "danger",
  "emergency",
]);

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isExpired(value) {
  const timestamp = toTimestamp(value);
  return Boolean(timestamp && timestamp <= Date.now());
}

function isFreshOperator(row) {
  const lastSeen = toTimestamp(row?.last_seen_at || row?.updated_at || row?.created_at);
  return Boolean(lastSeen && Date.now() - lastSeen <= ACTIVE_OPERATOR_WINDOW_MS);
}

function getLatLng(row) {
  const lat = toNumber(row?.lat ?? row?.latitude);
  const lng = toNumber(row?.lng ?? row?.longitude);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function normalizeTransportType(value) {
  const type = String(value || "bike").toLowerCase().trim();

  if (TRANSPORT_TYPES.has(type)) return type;
  if (["okada", "motorbike", "motorcycle"].includes(type)) return "bike";
  if (["tricycle", "auto", "autorickshaw"].includes(type)) return "keke";
  if (["taxi", "driver"].includes(type)) return "car";
  if (["bus", "minibus"].includes(type)) return "van";

  return "bike";
}

function normalizeLocationCategory(category) {
  const value = String(category || "Community").trim().toLowerCase();

  if (["fleet", "fleets", "operator", "transport"].includes(value)) return "Fleets";
  if (["pickup", "pickup point", "transport park", "park"].includes(value)) return "Pickup";
  if (["shop", "shops", "supermarket", "pharmacy", "fuel station"].includes(value)) return "Shops";
  if (["school", "schools"].includes(value)) return "Schools";
  if (["market", "markets"].includes(value)) return "Markets";
  if (["hospital", "clinic", "hospital / clinic", "police", "emergency"].includes(value)) return "Emergency";

  return "Community";
}

function normalizeOperator(row) {
  const point = getLatLng(row);
  if (!row || !point || !isFreshOperator(row)) return null;

  const type = normalizeTransportType(row.transport_type || row.type || row.vehicle_type);
  if (!TRANSPORT_TYPES.has(type)) return null;

  return {
    id: String(row.operator_id || row.id),
    operatorId: row.operator_id || row.id,
    name: row.display_name || row.name || "Nearby operator",
    type,
    available: row.available !== false,
    status: row.status || "online",
    lat: point.lat,
    lng: point.lng,
    heading: toNumber(row.heading),
    speedMps: toNumber(row.speed_mps),
    accuracyMeters: toNumber(row.accuracy_meters),
    batteryPercent: toNumber(row.battery_percent),
    lastSeenAt: row.last_seen_at || row.updated_at || row.created_at,
    raw: row,
  };
}

function normalizeNearbyLocation(row) {
  const point = getLatLng(row);
  if (!row || !point) return null;

  return {
    id: String(row.id),
    name: row.name || "Nearby location",
    category: normalizeLocationCategory(row.category),
    type: row.type || row.category || "Nearby place",
    status: row.status === "approved" ? "verified" : row.status || "community",
    visibility: row.visibility || "public",
    description: row.description || row.landmark || row.address || "Approved KunThai Area View location.",
    distance: row.address || row.landmark || "Live location",
    address: row.address || "",
    landmark: row.landmark || "",
    phone: row.phone || "",
    openingHours: row.opening_hours || "",
    lat: point.lat,
    lng: point.lng,
    raw: row,
  };
}

function getReportTitle(type, title) {
  if (title) return title;

  const labels = {
    accident: "Accident reported",
    road_block: "Road block ahead",
    flooding: "Flooding warning",
    police_checkpoint: "Police checkpoint",
    traffic: "Traffic congestion",
    bad_road: "Bad road warning",
    danger: "Road danger",
    emergency: "Emergency report",
  };

  return labels[type] || "Area report";
}

function normalizeReport(row) {
  const point = getLatLng(row);
  if (!row || !point) return null;
  if (isExpired(row.expires_at)) return null;

  const type = String(row.report_type || row.type || "traffic").toLowerCase();
  if (!ACTIVE_REPORT_TYPES.has(type)) return null;

  return {
    id: String(row.id),
    type,
    title: getReportTitle(type, row.title),
    description: row.description || row.message || "",
    severity: row.severity || "medium",
    status: row.status || "verified",
    lat: point.lat,
    lng: point.lng,
    roadName: row.road_name || row.roadName || row.area_name || "",
    expiresAt: row.expires_at,
    raw: row,
  };
}

function normalizeTrafficSnapshot(row) {
  const point = getLatLng(row);
  if (!row || !point) return null;
  if (isExpired(row.expires_at)) return null;

  const status = String(row.status || "green").toLowerCase();

  return {
    id: String(row.id),
    status: TRAFFIC_STATUSES.has(status) ? status : "green",
    source: row.source || "system",
    roadName: row.road_name || "",
    areaName: row.area_name || "",
    message: row.message || row.road_name || row.area_name || "Traffic update",
    averageSpeedMps: toNumber(row.average_speed_mps),
    confidenceScore: toNumber(row.confidence_score) ?? 0.5,
    lat: point.lat,
    lng: point.lng,
    radiusMeters: toNumber(row.radius_meters) || 500,
    expiresAt: row.expires_at,
    raw: row,
  };
}

function normalizeWeatherCache(row) {
  if (!row || isExpired(row.expires_at)) return null;
  const point = getLatLng(row) || {};

  return {
    id: String(row.id || row.area_key),
    areaKey: row.area_key || "",
    areaName: row.area_name || "Nearby area",
    lat: point.lat ?? null,
    lng: point.lng ?? null,
    temperatureC: toNumber(row.temperature_c),
    condition: row.condition || "",
    description: row.description || "",
    windSpeedMps: toNumber(row.wind_speed_mps),
    rain1hMm: toNumber(row.rain_1h_mm),
    visibilityMeters: toNumber(row.visibility_meters),
    riskLevel: row.risk_level || "normal",
    message: row.message || "",
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
    raw: row.raw_payload || row,
  };
}

function distanceInMeters(pointA, pointB) {
  if (!pointA?.lat || !pointA?.lng || !pointB?.lat || !pointB?.lng) return Infinity;

  const earthRadius = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);
  const deltaLat = toRadians(pointB.lat - pointA.lat);
  const deltaLng = toRadians(pointB.lng - pointA.lng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getCurrentUserId() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return "";
    return data?.user?.id || "";
  } catch {
    return "";
  }
}

export async function getApprovedNearbyLocations() {
  try {
    const { data, error } = await supabase
      .from("nearby_area_locations")
      .select("*")
      .eq("status", "approved")
      .eq("visibility", "public")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    return (data || []).map(normalizeNearbyLocation).filter(Boolean);
  } catch (error) {
    console.error("getApprovedNearbyLocations", error);
    return [];
  }
}

export async function getActiveTransportOperators() {
  try {
    const staleCutoff = new Date(Date.now() - ACTIVE_OPERATOR_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from("transport_operator_locations")
      .select("*")
      .eq("available", true)
      .in("status", ["online", "busy"])
      .gte("last_seen_at", staleCutoff)
      .order("last_seen_at", { ascending: false });

    if (error) throw error;

    return (data || []).map(normalizeOperator).filter(Boolean);
  } catch (error) {
    console.error("getActiveTransportOperators", error);
    return [];
  }
}

export async function getActiveAreaReports() {
  try {
    const { data, error } = await supabase
      .from("nearby_area_reports")
      .select("*")
      .in("status", ["verified", "submitted"])
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) throw error;

    return (data || []).map(normalizeReport).filter(Boolean);
  } catch (error) {
    console.error("getActiveAreaReports", error);
    return [];
  }
}

export async function getActiveTrafficSnapshots() {
  try {
    const { data, error } = await supabase
      .from("nearby_area_traffic_snapshots")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(80);

    if (error) throw error;

    return (data || []).map(normalizeTrafficSnapshot).filter(Boolean);
  } catch (error) {
    console.error("getActiveTrafficSnapshots", error);
    return [];
  }
}

export async function getNearbyWeatherCache(position = null) {
  try {
    const { data, error } = await supabase
      .from("nearby_area_weather_cache")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("fetched_at", { ascending: false })
      .limit(25);

    if (error) throw error;

    const weatherItems = (data || []).map(normalizeWeatherCache).filter(Boolean);
    if (!position?.lat || !position?.lng) return weatherItems[0] || null;

    return weatherItems
      .map((item) => ({ item, distance: distanceInMeters(position, item) }))
      .sort((a, b) => a.distance - b.distance)[0]?.item || weatherItems[0] || null;
  } catch (error) {
    console.error("getNearbyWeatherCache", error);
    return null;
  }
}

export async function getRecentSearchHistory() {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from("nearby_area_search_history")
      .select("*")
      .eq("user_id", userId)
      .eq("selected", true)
      .order("searched_at", { ascending: false })
      .limit(12);

    if (error) throw error;

    const seen = new Set();
    return (data || []).filter((item) => {
      const key = `${item.place_name || item.search_text}|${item.lat}|${item.lng}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    console.error("getRecentSearchHistory", error);
    return [];
  }
}

export async function saveNearbySearchHistory({ query, result, selected = true }) {
  const userId = await getCurrentUserId();
  const searchText = String(query || result?.name || "").trim();

  if (!userId || !searchText) return null;

  const payload = {
    user_id: userId,
    search_text: searchText,
    place_name: result?.name || result?.place_name || searchText,
    place_address: result?.address || result?.fullAddress || result?.place_address || result?.distance || "",
    category: result?.category || null,
    lat: toNumber(result?.lat),
    lng: toNumber(result?.lng),
    source: "area_view",
    selected,
    metadata: {
      result_id: result?.id || null,
      type: result?.type || null,
    },
  };

  try {
    const { data, error } = await supabase
      .from("nearby_area_search_history")
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error("saveNearbySearchHistory", error);
    return null;
  }
}

function scheduleLiveRefresh(timers, key, refresh) {
  if (timers[key]) window.clearTimeout(timers[key]);

  timers[key] = window.setTimeout(async () => {
    timers[key] = null;
    await refresh();
  }, LIVE_REFRESH_DEBOUNCE_MS);
}

export function subscribeToAreaViewLiveData({
  onLocations,
  onOperators,
  onReports,
  onTraffic,
  onWeather,
  weatherPosition = null,
} = {}) {
  const timers = {};

  const refreshLocations = () => getApprovedNearbyLocations().then((items) => onLocations?.(items));
  const refreshOperators = () => getActiveTransportOperators().then((items) => onOperators?.(items));
  const refreshReports = () => getActiveAreaReports().then((items) => onReports?.(items));
  const refreshTraffic = () => getActiveTrafficSnapshots().then((items) => onTraffic?.(items));
  const refreshWeather = () => getNearbyWeatherCache(weatherPosition).then((item) => onWeather?.(item));

  const channel = supabase
    .channel(`area-view-live-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "nearby_area_locations" }, () => {
      scheduleLiveRefresh(timers, "locations", refreshLocations);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "transport_operator_locations" }, () => {
      scheduleLiveRefresh(timers, "operators", refreshOperators);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "nearby_area_reports" }, () => {
      scheduleLiveRefresh(timers, "reports", refreshReports);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "nearby_area_traffic_snapshots" }, () => {
      scheduleLiveRefresh(timers, "traffic", refreshTraffic);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "nearby_area_weather_cache" }, () => {
      scheduleLiveRefresh(timers, "weather", refreshWeather);
    })
    .subscribe();

  return () => {
    Object.values(timers).forEach((timer) => {
      if (timer) window.clearTimeout(timer);
    });
    supabase.removeChannel(channel);
  };
}

export const getLiveOperators = getActiveTransportOperators;
export const getTrafficSnapshots = getActiveTrafficSnapshots;
export const getNearbyReports = getActiveAreaReports;
export const saveSearchHistory = saveNearbySearchHistory;

export function subscribeToOperators(callback) {
  return subscribeToAreaViewLiveData({ onOperators: callback });
}

export function subscribeToTraffic(callback) {
  return subscribeToAreaViewLiveData({ onTraffic: callback });
}

export function subscribeToReports(callback) {
  return subscribeToAreaViewLiveData({ onReports: callback });
}
