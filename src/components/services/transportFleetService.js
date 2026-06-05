import supabase from "../../Backend/lib/supabaseClient";

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

  if (answers.helmet === "yes") items.push("Passenger helmet confirmed");
  if (answers.passengerFootrest === "yes") items.push("Passenger footrest checked");
  if (answers.doorsWorking === "yes") items.push("Passenger doors working");
  if (answers.seatbelt === "yes") items.push("Seatbelts confirmed");
  if (answers.deliveryBox === "yes" || row.delivery_body_type) items.push("Delivery storage confirmed");
  if (answers.insurance === "yes") items.push("Insurance details submitted");
  if (!items.length && row.verification_status === "verified") items.push("KunThai verification checks passed");
  if (!items.length) items.push("Fleet details submitted by operator");

  return items;
}

function mapLiveFleet(row) {
  const operator = row.transport_operators || {};
  const serviceCategory = displayCategory(row.service_category);
  const fleetType = displayFleetType(row.fleet_type);
  const isActive = row.active_status === "active";
  const rating = Number(row.rating || 0);
  const trips = Number(row.completed_trips || row.trips_completed || 0);

  return {
    id: row.id,
    fleetName: row.fleet_name || `${operator.full_name || "KunThai"} ${fleetType}`,
    operatorRecordId: operator.id || row.operator_id || "",
    operatorName: operator.full_name || "Transport operator",
    operatorPhone: operator.phone || "",
    operatorCity: operator.city || "",
    operatorId: operator.display_code || `KT-${operator.operator_code || String(row.id).slice(0, 5).toUpperCase()}`,
    plateNumber: row.plate_number || "Plate pending",
    serviceCategory,
    fleetType,
    displayType: displayTypeForFleet(row.fleet_type, serviceCategory),
    verificationStatus: normalizeVerification(row.verification_status || operator.verification_status),
    activeStatus: row.active_status || "offline",
    currentLocation: row.current_location || row.home_base_location || row.operating_area || operator.city || "Location pending",
    lastKnownLocation: row.last_known_location || row.home_base_location || row.operating_area || operator.city || "Location pending",
    lastActive: isActive ? "Active now" : formatLastActive(row.last_active_at || row.updated_at),
    distanceKm: Number(row.distance_km || row.max_distance_km || 0),
    etaMinutes: row.eta_minutes ? Number(row.eta_minutes) : null,
    rating: rating || null,
    trips,
    priceHint: row.price_hint || (row.base_fare ? `From SLE ${Number(row.base_fare).toFixed(0)}` : "Fare confirmed on booking"),
    baseFare: Number(row.base_fare || 0),
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
    const plateKey = normalizeIdentityValue(fleet.plateNumber);
    const hasUsablePlate = plateKey && !["NO-PLATE", "PLATE PENDING", "PENDING"].includes(plateKey);

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
  const { data, error } = await supabase
    .from("transport_fleets")
    .select("*, transport_operators(id, full_name, phone, city, operator_code, display_code, verification_status)")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  const liveFleets = dedupeLiveFleets((data || []).map(mapLiveFleet));

  return sortFleets(
    liveFleets.filter((fleet) => matchesMode(fleet, selection.mode) && (!selection.fleetType || fleet.fleetType === selection.fleetType)),
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

  return data ? mapLiveFleet(data) : null;
}
