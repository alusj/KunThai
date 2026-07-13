import supabase from "../lib/supabaseClient";

const OPERATOR_STALE_MINUTES = 10;
const ACTIVE_OPERATOR_WINDOW_MS = OPERATOR_STALE_MINUTES * 60 * 1000;
const LIVE_REFRESH_DEBOUNCE_MS = 650;
const DEFAULT_AREA_RADIUS_KM = 25;
const MAX_AREA_RADIUS_KM = 60;

const TRANSPORT_TYPES = new Set(["bike", "keke", "car", "van"]);
const LIVE_OPERATOR_STATUSES = new Set(["online", "busy"]);
const TRAFFIC_STATUSES = new Set(["green", "yellow", "red"]);
const ACTIVE_REPORT_TYPES = new Set([
  "traffic",
  "accident",
  "road_block",
  "police_checkpoint",
  "flooding",
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

function normalizeAreaOptions(options = {}) {
  const area = typeof options === "function" ? options() : options;
  const center = area?.center || area?.position || area;
  const lat = toNumber(center?.lat);
  const lng = toNumber(center?.lng);

  if (lat == null || lng == null) {
    return {
      bounds: null,
      center: null,
      limit: Number(area?.limit || options?.limit || 120),
    };
  }

  const requestedRadius =
    toNumber(area?.radiusKm) ??
    (toNumber(area?.radiusMeters) != null ? toNumber(area.radiusMeters) / 1000 : null) ??
    DEFAULT_AREA_RADIUS_KM;
  const radiusKm = Math.min(MAX_AREA_RADIUS_KM, Math.max(1, requestedRadius));
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / Math.max(38, 111.32 * Math.cos((lat * Math.PI) / 180));

  return {
    center: { lat, lng },
    bounds: {
      minLat: lat - latDelta,
      maxLat: lat + latDelta,
      minLng: lng - lngDelta,
      maxLng: lng + lngDelta,
    },
    limit: Number(area?.limit || options?.limit || 120),
  };
}

function applyLatLngBounds(query, bounds) {
  if (!bounds) return query;
  return query
    .gte("lat", bounds.minLat)
    .lte("lat", bounds.maxLat)
    .gte("lng", bounds.minLng)
    .lte("lng", bounds.maxLng);
}

async function executeBoundedQuery(createQuery, options = {}) {
  const { bounds } = normalizeAreaOptions(options);

  try {
    const bounded = await createQuery(bounds);
    if (!bounded.error) return bounded.data || [];

    const missingCoordinateColumn =
      bounded.error.code === "42703" &&
      /lat|lng|latitude|longitude/i.test(bounded.error.message || "");

    if (!missingCoordinateColumn || !bounds) throw bounded.error;
  } catch {
    if (!bounds) return [];
  }

  const fallback = await createQuery(null);
  return fallback.error ? [] : fallback.data || [];
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

function getRowMetadata(row) {
  const metadata = row?.metadata;
  if (!metadata) return {};
  if (typeof metadata === "object") return metadata;

  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function isOperatorBooked(row, status) {
  const metadata = getRowMetadata(row);
  return Boolean(
    status === "busy" ||
      row?.booked ||
      row?.is_booked ||
      row?.active_trip_id ||
      row?.current_trip_id ||
      metadata.booked ||
      metadata.isBooked ||
      metadata.activeTripId ||
      metadata.currentTripId,
  );
}

function normalizeLocationCategory(category) {
  const value = String(category || "Community").trim().toLowerCase();

  if (["fleet", "fleets", "operator", "transport"].includes(value)) return "Fleets";
  if (["pickup", "pickup point", "transport park", "park"].includes(value)) return "Pickup";
  if (["shop", "shops", "supermarket", "pharmacy", "fuel station"].includes(value)) return "Shops";
  if (["school", "schools"].includes(value)) return "Schools";
  if (["market", "markets"].includes(value)) return "Markets";
  if (["hospital", "clinic", "hospital / clinic", "police", "fire station", "fire service", "emergency"].includes(value)) return "Emergency";

  return "Community";
}

function normalizeOperator(row) {
  const point = getLatLng(row);
  if (!row || !point || !isFreshOperator(row)) return null;

  const status = String(row.status || "online").toLowerCase();
  const available = row.available !== false && row.is_available !== false;
  if ((!available && status !== "busy") || !LIVE_OPERATOR_STATUSES.has(status)) return null;

  const type = normalizeTransportType(row.transport_type || row.fleet_type || row.type || row.vehicle_type);
  const booked = isOperatorBooked(row, status);

  return {
    id: String(row.operator_id || row.id),
    operatorId: row.operator_id || row.id,
    name: row.display_name || row.name || row.full_name || "Nearby operator",
    type,
    available,
    booked,
    status,
    statusLabel: booked ? "BOOKED" : "AVAILABLE",
    lat: point.lat,
    lng: point.lng,
    heading: toNumber(row.heading),
    speedMps: toNumber(row.speed_mps ?? row.speed),
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
    name: row.name || row.place_name || "Nearby location",
    category: normalizeLocationCategory(row.category),
    type: row.type || row.category || "Nearby place",
    status: "verified",
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

function normalizeLocationReview(row) {
  const point = getLatLng(row);
  if (!row || !point) return null;

  const status = String(row.status || "").toLowerCase();
  if (!["approved", "rejected"].includes(status)) return null;

  const metadata = getRowMetadata(row);
  const reason = String(
    row.admin_decision_reason ||
      row.review_reason ||
      row.rejection_reason ||
      row.admin_note ||
      metadata.adminDecisionReason ||
      metadata.decisionReason ||
      metadata.reason ||
      "",
  ).trim();

  return {
    id: String(row.id),
    name: row.name || row.place_name || "Submitted location",
    category: row.category || row.type || "Community",
    type: row.type || row.category || "Area View location",
    status,
    reason,
    address: row.address || "",
    landmark: row.landmark || "",
    description: row.description || "",
    lat: point.lat,
    lng: point.lng,
    reviewedAt: row.admin_decided_at || row.reviewed_at || row.updated_at || row.created_at,
    updatedAt: row.updated_at || row.created_at,
    raw: row,
  };
}

function isMissingNearbyAreaColumn(error, columnName) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  const normalizedColumn = String(columnName || "").toLowerCase();

  // NOT NULL errors also name the affected column. They prove that the
  // column exists, so only retry for genuine unknown-column/schema errors.
  return code === "42703" ||
    (code === "PGRST204" && message.includes(normalizedColumn)) ||
    (message.includes(normalizedColumn) && (
      message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("could not find")
    ));
}

function isMissingNearbyAreaTable(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes("nearby_area_locations") && message.includes("does not exist");
}

function getReportTitle(type, title) {
  if (title) return title;

  const labels = {
    traffic: "Traffic congestion",
    accident: "Accident reported",
    road_block: "Road block ahead",
    police_checkpoint: "Police checkpoint",
    flooding: "Flooding warning",
    bad_road: "Bad road warning",
    danger: "Road danger",
    emergency: "Emergency report",
  };

  return labels[type] || "Area report";
}

function normalizeReport(row) {
  const point = getLatLng(row);
  if (!row || !point || isExpired(row.expires_at)) return null;

  const type = String(row.report_type || row.type || "traffic").toLowerCase();
  if (!ACTIVE_REPORT_TYPES.has(type)) return null;

  return {
    id: String(row.id),
    type,
    title: getReportTitle(type, row.title),
    description: row.description || row.message || "",
    severity: String(row.severity || "medium").toLowerCase(),
    status: row.status || "verified",
    verified: row.verified !== false,
    lat: point.lat,
    lng: point.lng,
    roadName: row.road_name || row.roadName || row.area_name || "",
    areaName: row.area_name || row.areaName || "",
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    raw: row,
  };
}

function normalizeTrafficSnapshot(row) {
  const point = getLatLng(row);
  if (!row || !point || isExpired(row.expires_at)) return null;

  const status = String(row.status || row.traffic_status || "green").toLowerCase();

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
    radiusMeters: toNumber(row.radius_meters) || 420,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    raw: row,
  };
}

function normalizeWeatherCache(row) {
  if (!row || isExpired(row.expires_at)) return null;
  const point = getLatLng(row) || {};

  return {
    id: String(row.id || row.area_key || row.area_name || "weather-cache"),
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
  const startLat = toNumber(pointA?.lat);
  const startLng = toNumber(pointA?.lng);
  const endLat = toNumber(pointB?.lat);
  const endLng = toNumber(pointB?.lng);
  if (startLat == null || startLng == null || endLat == null || endLng == null) return Infinity;

  const earthRadius = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);
  const deltaLat = toRadians(endLat - startLat);
  const deltaLng = toRadians(endLng - startLng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortByDistance(items = [], center = null) {
  if (!center) return items;
  return [...items].sort((first, second) => distanceInMeters(center, first) - distanceInMeters(center, second));
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function getCurrentUserId() {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || "";
  } catch {
    return "";
  }
}

export async function getApprovedNearbyLocations(options = {}) {
  const { center, limit } = normalizeAreaOptions(options);
  const rows = await executeBoundedQuery((bounds) => {
    let query = supabase
      .from("nearby_area_locations")
      .select("*")
      .eq("status", "approved")
      .eq("visibility", "public")
      .order("updated_at", { ascending: false })
      .limit(limit);

    query = applyLatLngBounds(query, bounds);
    return query;
  }, options);

  return sortByDistance(dedupeById(rows.map(normalizeNearbyLocation).filter(Boolean)), center);
}

export async function submitNearbyAreaLocation(input = {}) {
  const userId = await getCurrentUserId();
  const lat = toNumber(input.lat);
  const lng = toNumber(input.lng);
  const placeName = String(input.name || input.placeName || "").trim();
  const category = String(input.category || "Community").trim();

  if (!placeName) {
    throw new Error("Enter the location name before submitting.");
  }

  if (lat == null || lng == null) {
    throw new Error("Use Locate Me or Drop Pin so KunThai can save the exact map point.");
  }

  let payload = {
    user_id: userId || null,
    submitted_by: userId || null,
    name: placeName,
    place_name: placeName,
    category,
    type: category,
    address: String(input.address || "").trim(),
    landmark: String(input.landmark || "").trim(),
    phone: String(input.phone || "").trim(),
    opening_hours: String(input.openingHours || input.opening_hours || "").trim(),
    description: String(input.description || "").trim(),
    lat,
    lng,
    status: "pending",
    visibility: "public",
    source: "area_view",
    metadata: {
      source: input.source || "area_view",
      coordinates_label: input.coordinatesLabel || "",
      suggested_address: String(input.suggestedAddress || "").trim(),
      accuracy_meters: toNumber(input.accuracyMeters),
    },
  };

  const optionalColumns = [
    "user_id",
    "submitted_by",
    "place_name",
    "type",
    "address",
    "landmark",
    "phone",
    "opening_hours",
    "description",
    "visibility",
    "source",
    "metadata",
  ];

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const { data, error } = await supabase.from("nearby_area_locations").insert(payload).select().maybeSingle();

    if (!error) {
      return normalizeNearbyLocation(data) || {
        id: data?.id || `submitted-${Date.now()}`,
        name: placeName,
        category: normalizeLocationCategory(category),
        type: category,
        status: "pending",
        visibility: "public",
        description: payload.description || payload.landmark || payload.address || "Submitted KunThai Area View location.",
        distance: payload.address || payload.landmark || "Submitted for review",
        address: payload.address,
        landmark: payload.landmark,
        phone: payload.phone,
        openingHours: payload.opening_hours,
        lat,
        lng,
        raw: data || payload,
      };
    }

    if (isMissingNearbyAreaTable(error)) {
      throw new Error("Area View location submissions are not installed yet.");
    }

    const missingColumn = optionalColumns.find((column) => payload[column] !== undefined && isMissingNearbyAreaColumn(error, column));
    if (!missingColumn) {
      throw new Error(error.message || "Unable to submit this location for review.");
    }

    const { [missingColumn]: _removed, ...nextPayload } = payload;
    payload = nextPayload;
  }

  throw new Error("Unable to submit this location for review.");
}

export async function getMyNearbyAreaLocationReviews(limit = 12) {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const resultLimit = Math.max(1, Math.min(Number(limit) || 12, 40));
  const applyBaseQuery = () =>
    supabase
      .from("nearby_area_locations")
      .select("*")
      .in("status", ["approved", "rejected"])
      .order("updated_at", { ascending: false })
      .limit(resultLimit);

  try {
    const { data, error } = await applyBaseQuery().or(`user_id.eq.${userId},submitted_by.eq.${userId}`);
    if (error) throw error;
    return (data || []).map(normalizeLocationReview).filter(Boolean);
  } catch (error) {
    if (isMissingNearbyAreaTable(error)) return [];
    if (!isMissingNearbyAreaColumn(error, "submitted_by") && !isMissingNearbyAreaColumn(error, "user_id")) {
      return [];
    }
  }

  const attempts = [
    (query) => query.eq("user_id", userId),
    (query) => query.eq("submitted_by", userId),
  ];
  const reviews = [];

  for (const applyOwnerFilter of attempts) {
    try {
      const { data, error } = await applyOwnerFilter(applyBaseQuery());
      if (error) throw error;
      reviews.push(...(data || []).map(normalizeLocationReview).filter(Boolean));
    } catch {
      // Older deployments may not have both owner columns. Keep the screen usable.
    }
  }

  return sortByDistance(dedupeById(reviews), null).sort((first, second) => {
    const firstTime = toTimestamp(first.reviewedAt || first.updatedAt) || 0;
    const secondTime = toTimestamp(second.reviewedAt || second.updatedAt) || 0;
    return secondTime - firstTime;
  });
}

export async function getLiveOperators(options = {}) {
  const { center, limit } = normalizeAreaOptions(options);
  const staleCutoff = new Date(Date.now() - ACTIVE_OPERATOR_WINDOW_MS).toISOString();
  const rows = await executeBoundedQuery((bounds) => {
    let query = supabase
      .from("transport_operator_locations")
      .select("*")
      .in("status", Array.from(LIVE_OPERATOR_STATUSES))
      .gte("last_seen_at", staleCutoff)
      .order("last_seen_at", { ascending: false })
      .limit(limit);

    query = applyLatLngBounds(query, bounds);
    return query;
  }, options);

  return sortByDistance(dedupeById(rows.map(normalizeOperator).filter(Boolean)), center);
}

export async function getNearbyReports(options = {}) {
  const { center, limit } = normalizeAreaOptions(options);
  const rows = await executeBoundedQuery((bounds) => {
    let query = supabase
      .from("nearby_area_reports")
      .select("*")
      .in("status", ["verified", "submitted", "active"])
      .order("created_at", { ascending: false })
      .limit(limit);

    query = applyLatLngBounds(query, bounds);
    return query;
  }, options);

  return sortByDistance(dedupeById(rows.map(normalizeReport).filter(Boolean)), center);
}

export async function getTrafficSnapshots(options = {}) {
  const { center, limit } = normalizeAreaOptions(options);
  const rows = await executeBoundedQuery((bounds) => {
    let query = supabase
      .from("nearby_area_traffic_snapshots")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("updated_at", { ascending: false })
      .limit(limit);

    query = applyLatLngBounds(query, bounds);
    return query;
  }, options);

  return sortByDistance(dedupeById(rows.map(normalizeTrafficSnapshot).filter(Boolean)), center);
}

export async function getWeatherCacheNearArea(position = null) {
  try {
    const { data, error } = await supabase
      .from("nearby_area_weather_cache")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("fetched_at", { ascending: false })
      .limit(25);

    if (error) return null;

    const weatherItems = (data || []).map(normalizeWeatherCache).filter(Boolean);
    if (!position?.lat || !position?.lng) return weatherItems[0] || null;

    return (
      weatherItems
        .map((item) => ({ item, distance: distanceInMeters(position, item) }))
        .sort((a, b) => a.distance - b.distance)[0]?.item ||
      weatherItems[0] ||
      null
    );
  } catch {
    return null;
  }
}

export async function getRecentSearchHistory(limit = 12) {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from("nearby_area_search_history")
      .select("*")
      .eq("user_id", userId)
      .eq("selected", true)
      .order("searched_at", { ascending: false })
      .limit(limit);

    if (error) return [];

    const seen = new Set();
    return (data || []).filter((item) => {
      const key = `${item.place_name || item.search_text}|${item.lat}|${item.lng}`;
      if (seen.has(key)) return false;
      seen.add(key);
      item.lat = toNumber(item.lat);
      item.lng = toNumber(item.lng);
      return true;
    });
  } catch {
    return [];
  }
}

export async function saveSearchHistory({ query, result, selected = true }) {
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

    return error ? null : data || null;
  } catch {
    return null;
  }
}

export async function deleteNearbySearchHistory(historyId) {
  const userId = await getCurrentUserId();
  if (!userId || !historyId) return false;

  try {
    const { error } = await supabase
      .from("nearby_area_search_history")
      .delete()
      .eq("id", historyId)
      .eq("user_id", userId);

    return !error;
  } catch {
    return false;
  }
}

function scheduleLiveRefresh(timers, key, refresh) {
  if (timers[key]) window.clearTimeout(timers[key]);

  timers[key] = window.setTimeout(async () => {
    timers[key] = null;
    await refresh();
  }, LIVE_REFRESH_DEBOUNCE_MS);
}

function getRuntimeOptions({ area, getArea, weatherPosition } = {}) {
  const runtimeArea = typeof getArea === "function" ? getArea() : area;
  return runtimeArea || { center: weatherPosition || null, radiusKm: DEFAULT_AREA_RADIUS_KM };
}

function subscribeToTable({ table, key, fetcher, callback, area, getArea }) {
  if (!callback) return () => {};

  const timers = {};
  const refresh = () =>
    fetcher(getRuntimeOptions({ area, getArea }))
      .then((items) => callback(items))
      .catch(() => {});
  const channel = supabase
    .channel(`area-view-${key}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, () => {
      scheduleLiveRefresh(timers, key, refresh);
    })
    .subscribe();

  return () => {
    Object.values(timers).forEach((timer) => {
      if (timer) window.clearTimeout(timer);
    });
    supabase.removeChannel(channel);
  };
}

export function subscribeToAreaViewLiveData({
  onLocations,
  onOperators,
  onReports,
  onTraffic,
  onWeather,
  weatherPosition = null,
  area = null,
  getArea = null,
} = {}) {
  const timers = {};
  const runtime = () => getRuntimeOptions({ area, getArea, weatherPosition });
  const refreshLocations = () => getApprovedNearbyLocations(runtime()).then((items) => onLocations?.(items));
  const refreshOperators = () => getLiveOperators(runtime()).then((items) => onOperators?.(items));
  const refreshReports = () => getNearbyReports(runtime()).then((items) => onReports?.(items));
  const refreshTraffic = () => getTrafficSnapshots(runtime()).then((items) => onTraffic?.(items));
  const refreshWeather = () => getWeatherCacheNearArea(weatherPosition).then((item) => onWeather?.(item));

  let channel = supabase.channel(`area-view-live-${Math.random().toString(36).slice(2)}`);

  if (onLocations) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "nearby_area_locations" }, () => {
      scheduleLiveRefresh(timers, "locations", refreshLocations);
    });
  }

  if (onOperators) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "transport_operator_locations" }, () => {
      scheduleLiveRefresh(timers, "operators", refreshOperators);
    });
  }

  if (onReports) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "nearby_area_reports" }, () => {
      scheduleLiveRefresh(timers, "reports", refreshReports);
    });
  }

  if (onTraffic) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "nearby_area_traffic_snapshots" }, () => {
      scheduleLiveRefresh(timers, "traffic", refreshTraffic);
    });
  }

  if (onWeather) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "nearby_area_weather_cache" }, () => {
      scheduleLiveRefresh(timers, "weather", refreshWeather);
    });
  }

  channel.subscribe();

  return () => {
    Object.values(timers).forEach((timer) => {
      if (timer) window.clearTimeout(timer);
    });
    supabase.removeChannel(channel);
  };
}

export function subscribeToMyNearbyAreaLocationReviews(callback) {
  if (!callback) return () => {};

  const timers = {};
  let channel = null;
  let cancelled = false;

  const refresh = () =>
    getMyNearbyAreaLocationReviews()
      .then((items) => {
        if (!cancelled) callback(items);
      })
      .catch(() => {});

  getCurrentUserId().then((userId) => {
    if (cancelled || !userId) return;

    channel = supabase
      .channel(`area-view-location-reviews-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nearby_area_locations" }, () => {
        scheduleLiveRefresh(timers, "location-reviews", refresh);
      })
      .subscribe();

    refresh();
  });

  return () => {
    cancelled = true;
    Object.values(timers).forEach((timer) => {
      if (timer) window.clearTimeout(timer);
    });
    if (channel) supabase.removeChannel(channel);
  };
}

export function subscribeToOperators(callback, options = {}) {
  return subscribeToTable({
    table: "transport_operator_locations",
    key: "operators",
    fetcher: getLiveOperators,
    callback,
    ...options,
  });
}

export function subscribeToReports(callback, options = {}) {
  return subscribeToTable({
    table: "nearby_area_reports",
    key: "reports",
    fetcher: getNearbyReports,
    callback,
    ...options,
  });
}

export function subscribeToTraffic(callback, options = {}) {
  return subscribeToTable({
    table: "nearby_area_traffic_snapshots",
    key: "traffic",
    fetcher: getTrafficSnapshots,
    callback,
    ...options,
  });
}

export const getActiveTransportOperators = getLiveOperators;
export const getActiveAreaReports = getNearbyReports;
export const getActiveTrafficSnapshots = getTrafficSnapshots;
export const getNearbyWeatherCache = getWeatherCacheNearArea;
export const saveNearbySearchHistory = saveSearchHistory;
