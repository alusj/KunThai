import supabase from "../../Backend/lib/supabaseClient";
import {
  filterCountryScopedItems,
  formatCountryMoney,
  getCountryCurrencyCode,
  normalizeCountryIso,
} from "../../data/westAfricanCountryProfiles";

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
          const fleets = await fetchTransportFleets({
            mode: "topRated",
            fleetType: null,
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

function displayTypeForFleet(fleetType, serviceCategory) {
  const type = displayFleetType(fleetType);
  if (serviceCategory === "Delivery" && type === "Motorcycle") return "Delivery Bike";
  if (serviceCategory === "Delivery" && type === "Car") return "Delivery Van";
  if (serviceCategory === "Delivery" && type === "Tricycle") return "Delivery Tricycle";
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

async function getCurrentPassenger(message = "Sign in to review this operator.") {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error(message);

  const meta = data.user.user_metadata || {};
  return {
    id: data.user.id,
    name: meta.full_name || meta.name || meta.username || data.user.email?.split("@")[0] || "Passenger",
  };
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

function mapLiveFleet(row, companyAffiliation = null, publicStats = null) {
  const operator = row.transport_operators || {};
  const serviceCategory = displayCategory(row.service_category);
  const fleetType = displayFleetType(row.fleet_type);
  const isActive = row.active_status === "active";
  const rating = Number(publicStats?.average_rating ?? row.rating ?? 0);
  const trips = Number(publicStats?.completed_trips ?? row.completed_trips ?? row.trips_completed ?? 0);
  const countryCode = normalizeCountryIso(row.country_iso || row.country_code || row.country || operator.country || operator.country_iso);
  const country = row.country || operator.country || "";
  const currency = row.currency || getCountryCurrencyCode(countryCode || country);
  const baseFare = Number(row.base_fare || 0);

  return {
    id: row.id,
    fleetName: row.fleet_name || `${operator.full_name || "KunThai"} ${fleetType}`,
    operatorRecordId: operator.id || row.operator_id || "",
    operatorName: operator.full_name || "Transport operator",
    operatorPhone: operator.phone || "",
    operatorCity: operator.city || "",
    country,
    countryCode,
    currency,
    operatorId: operator.display_code || `KT-${operator.operator_code || String(row.id).slice(0, 5).toUpperCase()}`,
    plateNumber: row.plate_number || "Plate pending",
    serviceCategory,
    fleetType,
    displayType: displayTypeForFleet(row.fleet_type, serviceCategory),
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
    currentLocation: row.current_location || row.home_base_location || row.operating_area || operator.city || "Location pending",
    lastKnownLocation: row.last_known_location || row.home_base_location || row.operating_area || operator.city || "Location pending",
    lastActive: isActive ? "Active now" : formatLastActive(row.last_active_at || row.updated_at),
    distanceKm: Number(row.distance_km || row.max_distance_km || 0),
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
    photos: [],
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
    acceptsRide: Boolean(row.accepts_ride),
    acceptsDelivery: Boolean(row.accepts_delivery),
    maxDistanceKm: row.max_distance_km || "",
    operatingHours: [row.operating_hours_start, row.operating_hours_end].filter(Boolean).join(" - "),
    updatedAt: row.updated_at || row.created_at || "",
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

  if (mode === "ride") {
    return fleet.serviceCategory === "Transport" || fleet.serviceCategory === "Both";
  }

  return fleet.serviceCategory === "Delivery" || fleet.serviceCategory === "Both";
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

    if (a.activeStatus === "active" && a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }

    return (statusRank[a.verificationStatus] ?? 9) - (statusRank[b.verificationStatus] ?? 9);
  });
}

export function getTransportFleets() {
  return [];
}

export function getTransportFleetById() {
  return null;
}

export async function fetchTransportFleets(selection = { mode: "topRated", fleetType: null }) {
  const includeOffline = selection.includeOffline === true;
  const { data, error } = await supabase
    .from("transport_fleets")
    .select("*, transport_operators(id, full_name, phone, city, operator_code, display_code, verification_status)")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  const [affiliations, stats] = await Promise.all([
    fetchPublicCompanyAffiliations((data || []).map((row) => row.operator_id)),
    fetchPublicFleetStats((data || []).map((row) => row.id)),
  ]);
  const liveFleets = dedupeLiveFleets((data || []).map((row) => mapLiveFleet(row, affiliations.get(row.id), stats.get(row.id))));
  const scopedFleets = filterCountryScopedItems(liveFleets, (fleet) => [fleet.countryCode, fleet.country], selection.country || selection.countryCode);
  const scopedFleetIds = new Set(scopedFleets.items.map((fleet) => fleet.id));
  const soleFleetsWithoutCountry = liveFleets.filter((fleet) =>
    !fleet.isCompanyFleet &&
    !fleet.countryCode &&
    !fleet.country &&
    !scopedFleetIds.has(fleet.id)
  );
  const passengerFleets = [...scopedFleets.items, ...soleFleetsWithoutCountry];

  return sortFleets(
    passengerFleets.filter((fleet) =>
      matchesMode(fleet, selection.mode) &&
      (!fleet.isCompanyFleet || fleet.isVisibleToPassengers) &&
      (!selection.fleetType || fleet.fleetType === selection.fleetType) &&
      (includeOffline || fleet.activeStatus === "active")
    ),
    selection.mode,
  );
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
  const [affiliations, stats] = await Promise.all([
    fetchPublicCompanyAffiliations([data.operator_id]),
    fetchPublicFleetStats([data.id]),
  ]);
  return mapLiveFleet(data, affiliations.get(data.id), stats.get(data.id));
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
    throw new Error(error.message || "Unable to load operator reviews.");
  }

  return (data || []).map(mapOperatorReview);
}

export async function submitTransportFleetReview(fleet, { rating, reviewText }) {
  const passenger = await getCurrentPassenger();
  const operatorId = fleet?.operatorRecordId || fleet?.operator_id || fleet?.operatorId;
  const score = Number(rating || 0);

  if (!operatorId) throw new Error("Operator review record is not available yet.");
  if (score < 1) throw new Error("Choose a rating before submitting your review.");

  const { data, error } = await supabase
    .from("transport_operator_reviews")
    .insert({
      operator_id: operatorId,
      passenger_name: passenger.name,
      rating: score,
      review_text: String(reviewText || "").trim(),
      created_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Unable to submit this review.");
  }

  return data ? mapOperatorReview(data) : null;
}
