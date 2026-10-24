import { applyFleetDistances, applyNearbyRanking } from "./topRatedNearby";
import { groupLiveDiscovery, isMissingRpcError, LIVE_DEFAULT_RADIUS_KM } from "./liveDiscovery";
import supabase from "../../Backend/lib/supabaseClient";
import { friendlyErrorMessage } from "../../Backend/services/friendlyErrorService";
import {
  formatCountryMoney,
  getActiveCountryProfile,
  getCountryCurrencyCode,
  normalizeCountryIso,
} from "../../data/globalCountryProfiles";
import {
  filterStrictSameCountry,
  filterCrossBorderRoute,
} from "../../Backend/services/countryResolution/countryVisibility";
import {
  isFleetAllowedForTransportMode,
  isFleetTypeAvailableForService,
} from "../../data/globalTransportCapabilities";
import { cachedQuery, invalidateCache } from "../../Backend/lib/queryCache";
import { resolvePublicCode } from "../../Backend/services/publicCodeService";
import { fleetOffersService } from "./fleetServiceOffer";

const TRANSPORT_FLEET_MEMORY = new Map();

function fleetSelectionKey(selection = {}) {
  const selectionCountry =
    selection.countryIso || selection.country_iso || selection.country || selection.countryCode || "";
  const countryIso = normalizeCountryIso(selectionCountry) || getActiveCountryProfile(selectionCountry).iso2 || "unknown";
  const crossBorder = selection.crossBorder
    ? `${normalizeCountryIso(selection.crossBorder.originIso)}-${normalizeCountryIso(selection.crossBorder.destinationIso)}`
    : "local";

  return [
    countryIso,
    crossBorder,
    selection.mode || "topRated",
    selection.fleetType || "all",
    selection.includeOffline === true ? "all-statuses" : "online",
  ].join(":");
}

function rememberTransportFleets(key, fleets) {
  TRANSPORT_FLEET_MEMORY.set(key, Array.isArray(fleets) ? fleets : []);
  if (TRANSPORT_FLEET_MEMORY.size > 16) {
    TRANSPORT_FLEET_MEMORY.delete(TRANSPORT_FLEET_MEMORY.keys().next().value);
  }
  return fleets;
}

export function subscribeToFleetUpdates(callback) {
  const channel = supabase

    .channel("transport-fleet-live")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "transport_fleets",
      },
      async () => {
        try {
          invalidateCache("transport-fleets:");
          const fleets = await fetchTransportFleets({
            mode: "topRated",
            fleetType: null,
            forceRefresh: true,
          });

          callback?.(fleets);
        } catch (error) {
          console.error("Realtime fleet refresh failed", error);
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

function displayCategory(value) {
  const map = { transport: "Transport", delivery: "Delivery", both: "Both" };
  return map[String(value || "").toLowerCase()] || value || "Transport";
}

function displayFleetType(value) {
  const map = { car: "Car", motorcycle: "Motorcycle", tricycle: "Tricycle" };
  return map[String(value || "").toLowerCase()] || value || "Fleet";
}

function normalizeVerification(value) {
  const map = {
    not_verified: "notVerified",
    verification_pending: "pending",
    verified_recommended: "recommended",
    notVerified: "notVerified",
  };

  return map[value] || value || "pending";
}

function displayTypeForFleet(fleetType, serviceCategory, countryContext = "") {
  const type = displayFleetType(fleetType);
  const deliveryOnlyByCountry =
    serviceCategory === "Both" &&
    !isFleetTypeAvailableForService(type, "ride", countryContext) &&
    isFleetTypeAvailableForService(type, "delivery", countryContext);
  const deliveryLabel = serviceCategory === "Delivery" || deliveryOnlyByCountry;

  if (deliveryLabel && type === "Motorcycle") return "Delivery Bike";
  if (deliveryLabel && type === "Car") return "Delivery Van";
  if (deliveryLabel && type === "Tricycle") return "Delivery Tricycle";
  if (type === "Car") return "Taxi";
  if (type === "Motorcycle") return "Motorbike";
  return type;
}

function normalizeIdentityValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

async function fetchPublicCompanyAffiliations(operatorIds = []) {
  const ids = Array.from(new Set(operatorIds.filter(Boolean)));
  if (!ids.length) return new Map();

  const { data, error } = await supabase.rpc("get_public_transport_company_affiliations", {
    operator_ids: ids,
  });
  if (error) return new Map();

  return new Map((data || []).map((row) => [row.transport_fleet_id || row.operator_id, row]));
}

async function fetchPublicFleetStats(fleetIds = []) {
  const ids = Array.from(new Set(fleetIds.filter(Boolean)));
  if (!ids.length) return new Map();

  const { data, error } = await supabase.rpc("get_public_transport_fleet_stats", {
    fleet_ids: ids,
  });
  if (error) return new Map();

  return new Map((data || []).map((row) => [row.fleet_id, row]));
}

async function fetchPublicFleetContacts(fleetIds = []) {
  const ids = Array.from(new Set(fleetIds.filter(Boolean)));
  if (!ids.length) return new Map();

  const { data, error } = await supabase.rpc("get_public_transport_fleet_contacts", {
    fleet_ids: ids,
  });
  if (error) return new Map();
  return new Map((data || []).map((row) => [row.fleet_id, row]));
}

function formatLastActive(value) {
  if (!value) return "Last active time unavailable";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Last active time unavailable";

  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 5) return "Active now";
  if (minutes < 60) return `Last active ${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last active ${hours}h ago`;
  return "Last active yesterday";
}

function buildSafety(row) {
  const answers = row.safety_answers || {};
  const items = [];
  const confirmed = (value) => String(value || "").trim().toLowerCase() === "yes";

  if (confirmed(answers.helmet)) items.push("Passenger helmet confirmed");
  if (confirmed(answers.brakes)) items.push("Brake system confirmed");
  if (confirmed(answers.passengerFootrest)) items.push("Passenger footrest checked");
  if (confirmed(answers.doorsWorking)) items.push("Passenger doors working");
  if (confirmed(answers.seatbelt) || confirmed(answers.seatbelts)) items.push("Seatbelts confirmed");
  if (confirmed(answers.lightsMirrors)) items.push("Lights, mirrors, indicators, and horn checked");
  if (confirmed(answers.entrySafe)) items.push("Passenger entry checked");
  if (confirmed(answers.coveredSpace)) items.push("Passenger or cargo space checked");
  if (confirmed(answers.sideBar)) items.push("Passenger supports checked");
  if (confirmed(answers.deliveryBox) || row.delivery_body_type) items.push("Delivery storage confirmed");
  if (confirmed(answers.insurance)) items.push("Insurance details submitted");
  if (!items.length && row.verification_status === "verified") items.push("KunThai verification checks passed");
  if (!items.length) items.push("Fleet details submitted by operator");

  return items;
}

function normalizePublicFleetPhotos(value) {
  let photos = value;
  if (typeof photos === "string") {
    try {
      photos = JSON.parse(photos);
    } catch {
      photos = [];
    }
  }
  if (!Array.isArray(photos)) return [];
  return photos
    .map((photo, index) => typeof photo === "string"
      ? { label: `Fleet view ${index + 1}`, url: photo }
      : { label: photo?.label || `Fleet view ${index + 1}`, url: photo?.url || photo?.fileUrl || photo?.publicUrl || "" })
    .filter((photo) => photo.url);
}

function mapOperatorReview(row) {
  return {
    id: row.id,
    passengerName: row.passenger_name || "Passenger",
    rating: Number(row.rating || 0),
    reviewText: row.review_text || "",
    responseText: row.response_text || "",
    createdAt: row.created_at,
  };
}

function mapLiveFleet(row, companyAffiliation = null, publicStats = null, publicContact = null) {
  const operator = row.transport_operators || {};
  const serviceCategory = displayCategory(row.service_category);
  const fleetType = displayFleetType(row.fleet_type);
  const isActive = row.active_status === "active";
  // One decimal ("3.7"): an average of reviews arrives as 3.6666666666666665.
  const rawRating = Number(publicStats?.average_rating ?? row.rating ?? 0);
  const rating = Number.isFinite(rawRating) ? Math.round(rawRating * 10) / 10 : 0;
  const trips = Number(publicStats?.completed_trips ?? row.completed_trips ?? row.trips_completed ?? 0);
  const countryCode = normalizeCountryIso(row.country_iso || row.country_code || row.country || operator.country || operator.country_iso);
  const country = row.country || operator.country || "";
  const currency = row.currency || getCountryCurrencyCode(countryCode || country);
  const baseFare = Number(row.base_fare || 0);

  return {
    id: row.id,
    fleetName: row.fleet_name || `${operator.full_name || "KunThai"} ${fleetType}`,
    operatorRecordId: publicContact?.operator_id || operator.id || row.operator_id || "",
    operatorName: publicContact?.operator_name || operator.full_name || "Transport operator",
    operatorPhone: publicContact?.operator_phone || operator.phone || "",
    operatorCity: operator.city || publicContact?.operator_city || "",
    country,
    countryCode,
    currency,
    // Never derive a code from the fleet UUID: it would look like a second,
    // different operator ID. RLS hides the nested operator from passengers, so
    // the public contact lookup carries the real KT code.
    operatorId: operator.display_code || publicContact?.operator_code || (operator.operator_code ? `KT-${operator.operator_code}` : ""),
    plateNumber: row.plate_number || "Plate pending",
    serviceCategory,
    fleetType,
    displayType: displayTypeForFleet(row.fleet_type, serviceCategory, countryCode || country),
    verificationStatus: normalizeVerification(row.verification_status || operator.verification_status),
    activeStatus: row.active_status || "offline",
    isVisibleToPassengers: Boolean(row.is_visible_to_passengers),
    fleetCode: row.fleet_code || companyAffiliation?.fleet_code || "",
    isCompanyFleet: Boolean(companyAffiliation?.company_id),
    companyId: companyAffiliation?.company_id || "",
    companyName: companyAffiliation?.company_name || "",
    companyCode: companyAffiliation?.company_code || "",
    companyType: companyAffiliation?.company_type || "",
    companyCity: companyAffiliation?.company_city || "",
    // The *_name columns hold the place recorded when the operator switched
    // Active on / off; the saved base is only a fallback.
    currentLocation: row.current_location_name || row.current_location || row.home_base_location || row.operating_area || operator.city || publicContact?.operator_city || "Location pending",
    lastKnownLocation: row.last_known_location_name || row.last_known_location || row.current_location_name || row.home_base_location || row.operating_area || operator.city || publicContact?.operator_city || "Location pending",
    lastActive: isActive ? "Active now" : formatLastActive(row.last_active_at || row.updated_at),
    // Only ever a distance measured from the passenger (attachFleetDistances /
    // fetchTopRatedNearby). max_distance_km is the operator's service range,
    // not how far away they are, so it must never be shown as a distance.
    distanceKm: null,
    etaMinutes: row.eta_minutes ? Number(row.eta_minutes) : null,
    rating: rating || null,
    reviewCount: Number(publicStats?.review_count || 0),
    latestReviewAt: publicStats?.latest_review_at || "",
    trips,
    priceHint: row.price_hint || (baseFare ? `From ${formatCountryMoney(baseFare, currency)}` : "Fare confirmed on booking"),
    baseFare,
    pricePerKm: Number(row.price_per_km || 0),
    pricePerHour: Number(row.price_per_hour || 0),
    safety: buildSafety(row),
    photos: normalizePublicFleetPhotos(row.public_fleet_photos),
    operatorPhotoUrl: row.public_operator_photo_url || "",
    make: row.make || "",
    model: row.model || "",
    year: row.manufacture_year || "",
    color: row.color || "",
    fuelType: row.fuel_type || "",
    bodyType: row.car_body_type || row.delivery_body_type || "",
    maxLoad: row.max_load || "",
    operatingArea: row.operating_area || "",
    availability: row.availability || "",
    homeBaseLocation: row.home_base_location || "",
    // Trip controls; null when the row doesn't carry them (fleetServiceOffer
    // then falls back to the registration category).
    acceptsRide: row.accepts_ride === null || row.accepts_ride === undefined ? null : Boolean(row.accepts_ride),
    acceptsDelivery: row.accepts_delivery === null || row.accepts_delivery === undefined ? null : Boolean(row.accepts_delivery),
    maxDistanceKm: row.max_distance_km || "",
    operatingHours: [row.operating_hours_start, row.operating_hours_end].filter(Boolean).join(" - "),
    updatedAt: row.updated_at || row.created_at || "",
    region: row.region || operator.region || "",
    district: row.district || operator.district || "",
    serviceArea: row.service_area || row.operating_area || "",
    // Cross-border capability (excluded from normal results; only surfaced in
    // the explicit Cross-Border mode). Absent columns default to disabled.
    crossBorderEnabled: Boolean(row.cross_border_enabled),
    approvedOriginCountries: row.approved_origin_countries || [],
    approvedDestinationCountries: row.approved_destination_countries || [],
    operatingLicenseStatus: row.operating_license_status || "",
  };
}

function dedupeLiveFleets(fleets) {
  const seenPlates = new Set();

  return fleets.filter((fleet) => {
    const normalizedPlate = normalizeIdentityValue(fleet.plateNumber);
    const plateKey = `${fleet.isCompanyFleet ? "company" : "sole"}:${normalizedPlate}`;
    const hasUsablePlate = normalizedPlate && !["NO-PLATE", "PLATE PENDING", "PENDING"].includes(normalizedPlate);

    if (hasUsablePlate && seenPlates.has(plateKey)) return false;

    if (hasUsablePlate) seenPlates.add(plateKey);
    return true;
  });
}

const statusRank = {
  recommended: 0,
  verified: 1,
  pending: 2,
  notVerified: 3,
};

function matchesMode(fleet, mode) {
  if (mode === "topRated") {
    return true;
  }

  // The operator's trip controls decide (fleetServiceOffer.js).
  return fleetOffersService(fleet, mode === "ride" ? "ride" : "delivery");
}

function sortFleets(fleets, mode) {
  return [...fleets].sort((a, b) => {
    if (mode === "topRated") {
      const ratingDifference = (b.rating || 0) - (a.rating || 0);
      if (ratingDifference !== 0) return ratingDifference;

      const tripDifference = (b.trips || 0) - (a.trips || 0);
      if (tripDifference !== 0) return tripDifference;
    }

    if (a.activeStatus !== b.activeStatus) {
      return a.activeStatus === "active" ? -1 : 1;
    }

    if (a.activeStatus === "active" && Number.isFinite(a.distanceKm) && Number.isFinite(b.distanceKm) && a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }

    return (statusRank[a.verificationStatus] ?? 9) - (statusRank[b.verificationStatus] ?? 9);
  });
}

export function getTransportFleets(selection = { mode: "topRated", fleetType: null }) {
  return TRANSPORT_FLEET_MEMORY.get(fleetSelectionKey(selection)) || [];
}

export function getTransportFleetById(id) {
  if (!id) return null;
  let match = null;
  for (const fleets of TRANSPORT_FLEET_MEMORY.values()) {
    const fleet = fleets.find((item) => item.id === id);
    // Prefer the copy that carries a distance measured from the passenger.
    if (fleet?.distanceSource) return fleet;
    if (fleet && !match) match = fleet;
  }
  return match;
}

async function runFleetListQuery(countryIsos = null) {
  let query = supabase
    .from("transport_fleets")
    .select("*, transport_operators(id, full_name, phone, city, operator_code, display_code, verification_status)")
    .order("updated_at", { ascending: false })
    .limit(100);

  // Country scoping is enforced in the DATABASE query, not just the client, so a
  // foreign operator is never even returned in the ordinary response. An empty
  // ISO list means "no confirmed country" -> return nothing.
  if (Array.isArray(countryIsos)) {
    if (!countryIsos.length) return [];
    query = query.in("country_iso", countryIsos);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function hydrateLiveFleets(rows) {
  const data = rows || [];
  const [affiliations, stats, contacts] = await Promise.all([
    fetchPublicCompanyAffiliations(data.map((row) => row.operator_id)),
    fetchPublicFleetStats(data.map((row) => row.id)),
    fetchPublicFleetContacts(data.map((row) => row.id)),
  ]);
  return dedupeLiveFleets(data.map((row) => mapLiveFleet(row, affiliations.get(row.id), stats.get(row.id), contacts.get(row.id))));
}

function passengerVisibilityFilters(fleet, selection, includeOffline) {
  return (
    (!fleet.isCompanyFleet || fleet.isVisibleToPassengers) &&
    (!selection.fleetType || fleet.fleetType === selection.fleetType) &&
    (includeOffline || fleet.activeStatus === "active")
  );
}

// Dedicated Cross-Border retrieval. This is the ONLY path allowed to return
// operators from another country, and only operators that are cross-border
// verified and legally cleared for the specific requested route.
async function fetchCrossBorderFleets(route, selection) {
  const includeOffline = selection.includeOffline === true;
  const isos = Array.from(new Set([route.originIso, route.destinationIso].filter(Boolean)));
  if (isos.length < 2) return [];

  let rows = [];
  try {
    rows = await runFleetListQuery(isos);
  } catch {
    rows = [];
  }
  const liveFleets = await hydrateLiveFleets(rows);
  const eligible = filterCrossBorderRoute(liveFleets, route);

  return sortFleets(
    eligible.filter((fleet) =>
      matchesMode(fleet, selection.mode) &&
      passengerVisibilityFilters(fleet, selection, includeOffline),
    ),
    selection.mode,
  );
}

async function fetchTransportFleetsUncached(selection = { mode: "topRated", fleetType: null }) {
  const includeOffline = selection.includeOffline === true;
  const selectionCountry =
    selection.countryIso || selection.country_iso || selection.country || selection.countryCode || "";

  // Cross-Border mode: only when the user has explicitly requested a supported
  // international route with both endpoints.
  const requestedRoute = selection.crossBorder;
  if (requestedRoute?.originIso && requestedRoute?.destinationIso) {
    return fetchCrossBorderFleets(
      {
        originIso: normalizeCountryIso(requestedRoute.originIso),
        destinationIso: normalizeCountryIso(requestedRoute.destinationIso),
      },
      selection,
    );
  }

  // Normal experience: the user's CURRENT country is a hard operational
  // boundary. It must be a validated ISO; there is no radius-only path and no
  // silent widening to nearby countries.
  const currentIso = normalizeCountryIso(selectionCountry) || getActiveCountryProfile(selectionCountry).iso2;
  if (!currentIso) return [];

  let rows = [];
  try {
    // Filter by country in the query itself — nearby and unscoped fallbacks are
    // intentionally gone. No same-country operators => empty result.
    rows = await runFleetListQuery([currentIso]);
  } catch {
    rows = [];
  }

  const liveFleets = await hydrateLiveFleets(rows);

  // Client-side safety net mirrors the DB filter: same-country only, and
  // operators with a missing/foreign country_code are excluded entirely.
  const { items: sameCountryFleets } = filterStrictSameCountry(liveFleets, currentIso);

  return sortFleets(
    sameCountryFleets.filter((fleet) =>
      matchesMode(fleet, selection.mode) &&
      isFleetAllowedForTransportMode(fleet, selection.mode, currentIso) &&
      passengerVisibilityFilters(fleet, selection, includeOffline),
    ),
    selection.mode,
  );
}

export async function fetchTransportFleets(selection = { mode: "topRated", fleetType: null }) {
  const key = fleetSelectionKey(selection);
  return cachedQuery(
    `transport-fleets:${key}`,
    () => fetchTransportFleetsUncached(selection).then((fleets) => rememberTransportFleets(key, fleets)),
    20_000,
    { force: selection.forceRefresh === true },
  );
}

// "Top Rated near you": the database ranks active fleets around the
// passenger (live or recent operator position, widening radius, weighted
// rating); the rows are then hydrated and passed through the same client
// safety filters as every other list. Throws when the ranking is unavailable
// (e.g. migration not applied yet) so the caller can fall back to the
// country-wide list.
export async function fetchTopRatedNearby({ latitude, longitude, accuracy = null, countryIso = "", fleetType = null, includeOffline = false } = {}) {
  const currentIso = normalizeCountryIso(countryIso) || getActiveCountryProfile(countryIso).iso2;
  if (!currentIso || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    return { rated: [], fresh: [], radiusKm: null };
  }

  const { data: rankingRows, error } = await supabase.rpc("transport_top_rated_nearby", {
    p_lat: Number(latitude),
    p_lng: Number(longitude),
    p_country: currentIso,
    p_fleet_type: fleetType || null,
    p_limit: 30,
  });
  if (error) throw error;
  const ids = (rankingRows || []).map((row) => row.fleet_id).filter(Boolean);
  if (!ids.length) return { rated: [], fresh: [], radiusKm: null };

  const { data: rows, error: rowsError } = await supabase
    .from("transport_fleets")
    .select("*, transport_operators(id, full_name, phone, city, operator_code, display_code, verification_status)")
    .in("id", ids);
  if (rowsError) throw rowsError;

  const liveFleets = await hydrateLiveFleets(rows || []);
  const { items: sameCountryFleets } = filterStrictSameCountry(liveFleets, currentIso);
  const selection = { mode: "topRated", fleetType, includeOffline };
  const allowed = sameCountryFleets.filter((fleet) =>
    isFleetAllowedForTransportMode(fleet, "topRated", currentIso) &&
    passengerVisibilityFilters(fleet, selection, includeOffline),
  );
  const ranked = applyNearbyRanking(allowed, rankingRows, { passengerAccuracy: accuracy });
  rememberTransportFleets("top-rated-nearby", [...ranked.rated, ...ranked.fresh]);
  return ranked;
}

// "Available near you" (live discovery). The database lists operators whose
// phone checked in within 2 minutes (available / busy) plus recently online
// ones; the rows are hydrated and passed through the same client safety
// filters as every other list. Hydrated fleets are reused for a minute so the
// 10-second refresh costs one RPC, not a full reload.
//
// Resolves { supported: false } when the RPC does not exist yet (migration not
// applied) so the caller keeps the older list; other errors are thrown.
const LIVE_FLEET_CACHE = new Map();
const LIVE_FLEET_CACHE_MS = 60_000;
let liveDiscoveryRpcMissing = false;

export function isLiveDiscoveryAvailable() {
  return !liveDiscoveryRpcMissing;
}

async function hydrateFleetsById(ids, forceRefresh = false) {
  const now = Date.now();
  const missing = ids.filter((id) => {
    const cached = LIVE_FLEET_CACHE.get(id);
    return forceRefresh || !cached || now - cached.at > LIVE_FLEET_CACHE_MS;
  });
  if (missing.length) {
    const { data: rows, error } = await supabase
      .from("transport_fleets")
      .select("*, transport_operators(id, full_name, phone, city, operator_code, display_code, verification_status)")
      .in("id", missing);
    if (error) throw error;
    const hydrated = await hydrateLiveFleets(rows || []);
    const found = new Set();
    for (const fleet of hydrated) {
      LIVE_FLEET_CACHE.set(fleet.id, { fleet, at: now });
      found.add(fleet.id);
    }
    // Rows the passenger may not read (RLS) are remembered as absent too.
    for (const id of missing) if (!found.has(id)) LIVE_FLEET_CACHE.set(id, { fleet: null, at: now });
    if (LIVE_FLEET_CACHE.size > 300) {
      for (const [key, value] of LIVE_FLEET_CACHE) if (now - value.at > LIVE_FLEET_CACHE_MS) LIVE_FLEET_CACHE.delete(key);
    }
  }
  return ids.map((id) => LIVE_FLEET_CACHE.get(id)?.fleet).filter(Boolean);
}

export async function fetchAvailableOperatorsNearby({
  latitude,
  longitude,
  countryIso = "",
  mode = "topRated",
  fleetType = null,
  radiusKm = LIVE_DEFAULT_RADIUS_KM,
  limit = 20,
  forceRefresh = false,
  accuracy = null,
} = {}) {
  if (liveDiscoveryRpcMissing) return { supported: false };
  const currentIso = normalizeCountryIso(countryIso) || getActiveCountryProfile(countryIso).iso2;
  if (!currentIso || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    return { supported: false };
  }

  const { data: rows, error } = await supabase.rpc("transport_available_operators_nearby", {
    p_lat: Number(latitude),
    p_lng: Number(longitude),
    p_radius_km: radiusKm,
    p_fleet_type: fleetType ? String(fleetType).toLowerCase() : null,
    p_limit: limit,
    p_country: currentIso,
    p_include_recent: true,
  });
  if (error) {
    if (isMissingRpcError(error)) {
      liveDiscoveryRpcMissing = true;
      return { supported: false };
    }
    throw error;
  }

  const list = Array.isArray(rows) ? rows : [];
  const ids = Array.from(new Set(list.map((row) => row?.fleet_id).filter(Boolean)));
  const radius = Math.min(Math.max(Number(radiusKm) || LIVE_DEFAULT_RADIUS_KM, 1), 50);
  if (!ids.length) return { supported: true, available: [], recent: [], radiusKm: radius };

  const fleets = await hydrateFleetsById(ids, forceRefresh);
  const { items: sameCountryFleets } = filterStrictSameCountry(fleets, currentIso);
  const selection = { mode, fleetType, includeOffline: false };
  const allowed = sameCountryFleets.filter((fleet) =>
    matchesMode(fleet, mode) &&
    isFleetAllowedForTransportMode(fleet, mode, currentIso) &&
    passengerVisibilityFilters(fleet, selection, false),
  );
  const groups = groupLiveDiscovery(allowed, list, { passengerAccuracy: accuracy });
  rememberTransportFleets("live-discovery", [...groups.available, ...groups.recent]);
  return { supported: true, ...groups, radiusKm: radius };
}

// Realtime nudge for "Available near you": calls back (with the change) when
// an operator location row changes. transport_operator_locations is in the
// supabase_realtime publication (20260817150000); RLS only delivers rows a
// passenger may see. Returns the unsubscribe function.
export function subscribeToOperatorLocationChanges(callback) {
  let channel = null;
  try {
    channel = supabase
      .channel(`urride-live-discovery-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transport_operator_locations" }, (payload) => {
        try {
          callback?.(payload);
        } catch {
          // A refresh nudge must never break the list.
        }
      })
      .subscribe();
  } catch {
    channel = null;
  }
  return () => {
    if (channel) supabase.removeChannel(channel);
    channel = null;
  };
}

// Book a Ride / Send Delivery lists: measured distance from the passenger to
// each listed fleet (live or recent operator position), active fleets nearest
// first. Best-effort: on any failure the list is returned unchanged, with no
// distance shown.
export async function attachFleetDistances(fleets = [], position = null) {
  const latitude = Number(position?.latitude);
  const longitude = Number(position?.longitude);
  const ids = (fleets || []).map((fleet) => fleet.id).filter(Boolean).slice(0, 200);
  if (!ids.length || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return fleets;

  try {
    const { data, error } = await supabase.rpc("transport_fleet_distances", {
      p_lat: latitude,
      p_lng: longitude,
      p_fleet_ids: ids,
    });
    if (error || !Array.isArray(data)) return fleets;
    return applyFleetDistances(fleets, data, { passengerAccuracy: position?.accuracy });
  } catch {
    return fleets;
  }
}

export async function fetchTransportFleetById(id) {
  const { data, error } = await supabase
    .from("transport_fleets")
    .select("*, transport_operators(id, full_name, phone, city, operator_code, display_code, verification_status)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;
  const [affiliations, stats, contacts] = await Promise.all([
    fetchPublicCompanyAffiliations([data.operator_id]),
    fetchPublicFleetStats([data.id]),
    fetchPublicFleetContacts([data.id]),
  ]);
  return mapLiveFleet(data, affiliations.get(data.id), stats.get(data.id), contacts.get(data.id));
}

// Nearby Area map: the profile behind a live operator marker. Markers carry
// the operator's auth user id; the profile link uses the fleet id. Resolves
// { fleetId, companyId } or null (no visible fleet).
const LIVE_OPERATOR_PROFILE_CACHE = new Map();
const LIVE_OPERATOR_PROFILE_CACHE_MS = 5 * 60_000;
let liveOperatorProfileRpcMissing = false;

// Until 20261024120000_urride_live_operator_profile.sql is applied: live
// discovery around the marker's own position. Its row is the fleet at
// distance 0; two operators on the same spot are left unresolved.
async function fetchLiveOperatorProfileByPosition({ lat, lng, countryCode }) {
  const countryIso = normalizeCountryIso(countryCode) || getActiveCountryProfile(countryCode).iso2;
  if (!countryIso || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  const { data, error } = await supabase.rpc("transport_available_operators_nearby", {
    p_lat: Number(lat),
    p_lng: Number(lng),
    p_radius_km: 1,
    p_fleet_type: null,
    p_limit: 5,
    p_country: countryIso,
    p_include_recent: true,
  });
  if (error) {
    if (isMissingRpcError(error)) return null;
    throw error;
  }
  const here = (Array.isArray(data) ? data : []).filter((row) => row?.fleet_id && Number(row.distance_m) === 0);
  return here.length === 1 ? { fleetId: here[0].fleet_id, companyId: "" } : null;
}

export async function fetchLiveOperatorProfile(operator) {
  const id = String(operator?.operatorId || operator?.id || "");
  if (!id) return null;
  const cached = LIVE_OPERATOR_PROFILE_CACHE.get(id);
  if (cached && Date.now() - cached.at < LIVE_OPERATOR_PROFILE_CACHE_MS) return cached.profile;

  let profile = null;
  if (!liveOperatorProfileRpcMissing) {
    const { data, error } = await supabase.rpc("transport_live_operator_profile", { p_operator_user_id: id });
    if (error && !isMissingRpcError(error)) throw error;
    if (error) {
      liveOperatorProfileRpcMissing = true;
    } else {
      const row = Array.isArray(data) ? data[0] : data;
      profile = row?.fleet_id ? { fleetId: row.fleet_id, companyId: row.company_id || "" } : null;
    }
  }
  if (liveOperatorProfileRpcMissing) profile = await fetchLiveOperatorProfileByPosition(operator);
  if (profile) LIVE_OPERATOR_PROFILE_CACHE.set(id, { profile, at: Date.now() });
  return profile;
}

function compactFleetCode(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

/**
 * The bookable fleet behind an operator code a passenger typed: the operator's
 * KT- code (with or without "KT") or a company fleet code. Looks through the
 * same passenger-visible fleet list UrRide shows first, then falls back to the
 * public code resolver. Returns null when nothing bookable matches; a company
 * fleet the company hides from passengers never matches.
 */
export async function findBookableFleetByCode(code) {
  const wanted = compactFleetCode(code);
  if (wanted.length < 3) return null;
  // "KT-685B8", "kt 685b8" and "685B8" are the same operator.
  const candidates = new Set([wanted, wanted.startsWith("KT") ? wanted : `KT${wanted}`]);
  const matches = (fleet) => candidates.has(compactFleetCode(fleet.operatorId)) || (fleet.fleetCode && candidates.has(compactFleetCode(fleet.fleetCode)));

  const listed = await fetchTransportFleets({ mode: "topRated", fleetType: null, includeOffline: true }).catch(() => []);
  const found = listed.filter(matches);
  if (found.length) return found.find((fleet) => fleet.activeStatus === "active") || found[0];

  for (const candidate of candidates) {
    const resolved = await resolvePublicCode(candidate).catch(() => null);
    if (resolved?.kind !== "urride" || !resolved.operatorId) continue;
    const { data } = await supabase
      .from("transport_fleets")
      .select("id, active_status")
      .eq("operator_id", resolved.operatorId)
      .order("updated_at", { ascending: false })
      .limit(5);
    const rows = data || [];
    const row = rows.find((item) => item.active_status === "active") || rows[0];
    if (!row) continue;
    const fleet = await fetchTransportFleetById(row.id).catch(() => null);
    if (fleet && (!fleet.isCompanyFleet || fleet.isVisibleToPassengers)) return fleet;
  }
  return null;
}

export async function fetchTransportFleetReviews(fleet) {
  const operatorId = fleet?.operatorRecordId || fleet?.operator_id || fleet?.operatorId;
  if (!operatorId) return [];

  const publicResult = await supabase.rpc("get_public_transport_operator_reviews", {
    operator_uuid: operatorId,
  });
  if (!publicResult.error) return (publicResult.data || []).map(mapOperatorReview);

  const { data, error } = await supabase
    .from("transport_operator_reviews")
    .select("*")
    .eq("operator_id", operatorId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(friendlyErrorMessage(error, "Unable to load operator reviews."));
  }

  return (data || []).map(mapOperatorReview);
}

export async function fetchTransportFleetReviewEligibility(fleet, tripId = null) {
  const operatorId = fleet?.operatorRecordId || fleet?.operator_id || fleet?.operatorId;
  if (!operatorId) {
    return {
      eligible: false,
      tripId: null,
      reason: "Book this operator and wait for the booking to be accepted before adding a review.",
    };
  }

  const { data, error } = await supabase.rpc("get_transport_review_eligibility", {
    p_operator_id: operatorId,
    p_trip_id: tripId || null,
  });

  if (error) throw new Error(friendlyErrorMessage(error, "Unable to verify review access."));

  const result = Array.isArray(data) ? data[0] : data;
  return {
    eligible: Boolean(result?.eligible),
    tripId: result?.trip_id || null,
    reason: result?.reason || "Book this operator and wait for acceptance before adding a review.",
  };
}

export async function submitTransportFleetReview(fleet, { rating, reviewText }) {
  const operatorId = fleet?.operatorRecordId || fleet?.operator_id || fleet?.operatorId;
  const score = Number(rating || 0);

  if (!operatorId) throw new Error("Operator review record is not available yet.");
  if (score < 1) throw new Error("Choose a rating before submitting your review.");

  const { data, error } = await supabase.rpc("submit_verified_transport_review", {
    p_operator_id: operatorId,
    p_rating: score,
    p_review_text: String(reviewText || "").trim(),
    p_trip_id: null,
  });

  if (error) {
    throw new Error(friendlyErrorMessage(error, "Unable to submit this review."));
  }

  return data ? mapOperatorReview(data) : null;
}
