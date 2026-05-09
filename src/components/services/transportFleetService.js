import supabase from "../../Backend/lib/supabaseClient";

const fleetData = [
  {
    id: "fleet-alpha-bike",
    fleetName: "Alpha City Bike",
    operatorId: "KT-73042",
    plateNumber: "MKL 552",
    serviceCategory: "Transport",
    fleetType: "Motorcycle",
    displayType: "Motorbike",
    verificationStatus: "verified",
    activeStatus: "active",
    currentLocation: "Lumley Roundabout",
    lastKnownLocation: "Lumley Roundabout",
    lastActive: "Active now",
    distanceKm: 0.8,
    etaMinutes: 4,
    rating: 4.5,
    trips: 214,
    priceHint: "From SLE 18",
    safety: ["Passenger helmet available", "Brake system checked", "Mirrors and lights working"],
    photos: ["Front view", "Back view", "Left side", "Right side"],
  },
  {
    id: "fleet-easy-bike",
    fleetName: "Easy Move Bike",
    operatorId: "KT-65820",
    plateNumber: "BKE 441",
    serviceCategory: "Both",
    fleetType: "Motorcycle",
    displayType: "Motorbike",
    verificationStatus: "recommended",
    activeStatus: "active",
    currentLocation: "Aberdeen Road",
    lastKnownLocation: "Aberdeen Road",
    lastActive: "Active now",
    distanceKm: 1.1,
    etaMinutes: 6,
    rating: 4.9,
    trips: 391,
    priceHint: "From SLE 20",
    safety: ["Passenger helmet available", "Delivery box fitted", "Admin recommended"],
    photos: ["Front view", "Back view", "Left side", "Right side"],
  },
  {
    id: "fleet-kadiatu-keke",
    fleetName: "Kadiatu Keke",
    operatorId: "KT-10936",
    plateNumber: "TRC 011",
    serviceCategory: "Transport",
    fleetType: "Tricycle",
    displayType: "Tricycle",
    verificationStatus: "pending",
    activeStatus: "offline",
    currentLocation: null,
    lastKnownLocation: "Waterloo Park",
    lastActive: "Last active 2h ago",
    distanceKm: 3.4,
    etaMinutes: null,
    rating: 4.1,
    trips: 89,
    priceHint: "From SLE 15",
    safety: ["Documents under review", "Passenger entry pending admin check"],
    photos: ["Front view", "Back view", "Left side", "Right side"],
  },
  {
    id: "fleet-central-keke",
    fleetName: "Central Keke Line",
    operatorId: "KT-48291",
    plateNumber: "KEK 220",
    serviceCategory: "Both",
    fleetType: "Tricycle",
    displayType: "Tricycle",
    verificationStatus: "recommended",
    activeStatus: "active",
    currentLocation: "Siaka Stevens Street",
    lastKnownLocation: "Siaka Stevens Street",
    lastActive: "Active now",
    distanceKm: 1.6,
    etaMinutes: 8,
    rating: 4.8,
    trips: 502,
    priceHint: "From SLE 17",
    safety: ["Passenger rails checked", "Cargo space covered", "Admin recommended"],
    photos: ["Front view", "Back view", "Left side", "Right side"],
  },
  {
    id: "fleet-alpha-taxi",
    fleetName: "Alpha City Taxi",
    operatorId: "KT-88410",
    plateNumber: "ABX 184",
    serviceCategory: "Transport",
    fleetType: "Car",
    displayType: "Taxi",
    verificationStatus: "recommended",
    activeStatus: "active",
    currentLocation: "Central",
    lastKnownLocation: "Central",
    lastActive: "Active now",
    distanceKm: 0.5,
    etaMinutes: 3,
    rating: 4.8,
    trips: 621,
    priceHint: "From SLE 35",
    safety: ["Seatbelts usable", "Interior checked", "Road worthiness approved"],
    photos: ["Front view", "Back view", "Left side", "Right side", "Interior"],
  },
  {
    id: "fleet-open-car-delivery",
    fleetName: "Open Fleet Van",
    operatorId: "KT-94073",
    plateNumber: "VAN 903",
    serviceCategory: "Delivery",
    fleetType: "Car",
    displayType: "Van",
    verificationStatus: "notVerified",
    activeStatus: "offline",
    currentLocation: null,
    lastKnownLocation: "Congo Cross",
    lastActive: "Last active yesterday",
    distanceKm: 4.2,
    etaMinutes: null,
    rating: null,
    trips: 12,
    priceHint: "Quote required",
    safety: ["Not yet checked by KunThai", "Use caution before booking"],
    photos: ["Front view", "Back view", "Left side", "Right side"],
  },
  {
    id: "fleet-fast-delivery-bike",
    fleetName: "Fast Drop Bike",
    operatorId: "KT-45176",
    plateNumber: "FDX 118",
    serviceCategory: "Delivery",
    fleetType: "Motorcycle",
    displayType: "Delivery Bike",
    verificationStatus: "verified",
    activeStatus: "active",
    currentLocation: "Wilkinson Road",
    lastKnownLocation: "Wilkinson Road",
    lastActive: "Active now",
    distanceKm: 0.9,
    etaMinutes: 5,
    rating: 4.6,
    trips: 177,
    priceHint: "From SLE 22",
    safety: ["Delivery box fitted", "License checked", "Insurance checked"],
    photos: ["Front view", "Back view", "Left side", "Right side", "Delivery box"],
  },
  {
    id: "fleet-keke-delivery",
    fleetName: "Market Keke Delivery",
    operatorId: "KT-33610",
    plateNumber: "DLK 720",
    serviceCategory: "Delivery",
    fleetType: "Tricycle",
    displayType: "Delivery Tricycle",
    verificationStatus: "pending",
    activeStatus: "active",
    currentLocation: "Kissy Road",
    lastKnownLocation: "Kissy Road",
    lastActive: "Active now",
    distanceKm: 2.2,
    etaMinutes: 10,
    rating: 4.2,
    trips: 64,
    priceHint: "From SLE 28",
    safety: ["Documents under review", "Open booth cargo space photo submitted"],
    photos: ["Front view", "Back view", "Left side", "Right side"],
  },
];

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

function formatLastActive(value) {
  if (!value) return "Last active time unavailable";
  const diffMs = Date.now() - new Date(value).getTime();
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
  };
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

export function getTransportFleets({ mode, fleetType }) {
  return fleetData
    .filter((fleet) => matchesMode(fleet, mode) && (!fleetType || fleet.fleetType === fleetType))
    .sort((a, b) => {
      if (mode === "topRated") {
        const ratingDifference = (b.rating || 0) - (a.rating || 0);
        if (ratingDifference !== 0) return ratingDifference;

        const tripDifference = b.trips - a.trips;
        if (tripDifference !== 0) return tripDifference;
      }

      if (a.activeStatus !== b.activeStatus) {
        return a.activeStatus === "active" ? -1 : 1;
      }

      if (a.activeStatus === "active" && a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }

      return statusRank[a.verificationStatus] - statusRank[b.verificationStatus];
    });
}

export function getTransportFleetById(id) {
  return fleetData.find((fleet) => fleet.id === id);
}

export async function fetchTransportFleets(selection) {
  const { data, error } = await supabase
    .from("transport_fleets")
    .select("*, transport_operators(full_name, phone, city, operator_code, display_code, verification_status)")
    .eq("is_visible_to_passengers", true)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return getTransportFleets(selection);
  }

  const liveFleets = (data || []).map(mapLiveFleet);
  if (!liveFleets.length) {
    return getTransportFleets(selection);
  }

  return liveFleets
    .filter((fleet) => matchesMode(fleet, selection.mode) && (!selection.fleetType || fleet.fleetType === selection.fleetType))
    .sort((a, b) => {
      if (a.activeStatus !== b.activeStatus) return a.activeStatus === "active" ? -1 : 1;
      return (b.rating || 0) - (a.rating || 0);
    });
}

export async function fetchTransportFleetById(id) {
  const { data, error } = await supabase
    .from("transport_fleets")
    .select("*, transport_operators(full_name, phone, city, operator_code, display_code, verification_status)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return getTransportFleetById(id);
  }

  return mapLiveFleet(data);
}
