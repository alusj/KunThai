import { getActiveCountryProfile, normalizeCountryIso } from "./globalCountryProfiles";

const TAXI_ONLY_RIDE_COUNTRIES = new Set([
  "AD", "AE", "AT", "AU", "BE", "CA", "CH", "CY", "CZ", "DE", "DK", "EE",
  "ES", "FI", "FR", "GB", "GR", "HK", "HR", "IE", "IL", "IS", "IT", "JP",
  "KR", "KW", "LI", "LT", "LU", "LV", "MC", "MT", "NL", "NO", "NZ", "PL",
  "PT", "QA", "SA", "SE", "SG", "SI", "SK", "SM", "TW", "US", "VA",
]);

const FULL_RIDE_OPTIONS = Object.freeze([
  { value: "Motorcycle", label: "Bike", displayName: "Bike", companyValue: "Motorbike", mapType: "bike" },
  { value: "Tricycle", label: "Tricycle", displayName: "Tricycle", companyValue: "Tricycle", mapType: "keke" },
  { value: "Car", label: "Taxi", displayName: "Taxi", companyValue: "Taxi", mapType: "car" },
]);

const TAXI_ONLY_RIDE_OPTIONS = Object.freeze([
  { value: "Car", label: "Taxi", displayName: "Taxi", companyValue: "Taxi", mapType: "car" },
]);

const FULL_DELIVERY_OPTIONS = Object.freeze([
  { value: "Motorcycle", label: "Bike", displayName: "Delivery Bike", companyValue: "Motorbike", mapType: "bike" },
  { value: "Tricycle", label: "Tricycle", displayName: "Delivery Tricycle", companyValue: "Tricycle", mapType: "keke" },
  { value: "Car", label: "Van", displayName: "Van", companyValue: "Van", mapType: "van" },
]);

const TAXI_ONLY_DELIVERY_OPTIONS = Object.freeze([
  { value: "Motorcycle", label: "Bike", displayName: "Delivery Bike", companyValue: "Motorbike", mapType: "bike" },
  { value: "Car", label: "Van", displayName: "Van", companyValue: "Van", mapType: "van" },
]);

const FULL_PERSONAL_SERVICE_CATEGORIES = Object.freeze(["Transport", "Delivery", "Both"]);
const TAXI_ONLY_PERSONAL_SERVICE_CATEGORIES = Object.freeze(["Transport", "Delivery"]);
const FULL_COMPANY_SERVICE_CATEGORIES = Object.freeze(["Ride only", "Delivery only", "Ride and delivery"]);
const TAXI_ONLY_COMPANY_SERVICE_CATEGORIES = Object.freeze(["Ride only", "Delivery only"]);

// Database fleet-type keys (kunthai_countries.ride_fleet_types /
// delivery_fleet_types) mapped onto the UI option shapes.
const RIDE_OPTION_BY_DB_TYPE = Object.freeze({
  motorcycle: FULL_RIDE_OPTIONS[0],
  tricycle: FULL_RIDE_OPTIONS[1],
  car: FULL_RIDE_OPTIONS[2],
});

const DELIVERY_OPTION_BY_DB_TYPE = Object.freeze({
  motorcycle: FULL_DELIVERY_OPTIONS[0],
  tricycle: FULL_DELIVERY_OPTIONS[1],
  van: FULL_DELIVERY_OPTIONS[2],
  car: FULL_DELIVERY_OPTIONS[2],
});

function optionsFromDbTypes(types, optionByType) {
  const byValue = new Map();
  for (const type of types) {
    const option = optionByType[String(type || "").trim().toLowerCase()];
    if (option && !byValue.has(option.value)) byValue.set(option.value, { ...option });
  }
  return Array.from(byValue.values());
}

function profileForContext(context = {}) {
  return getActiveCountryProfile(
    context?.countryCode ||
      context?.countryIso ||
      context?.country_iso ||
      context?.country ||
      context,
  );
}

function cloneOptions(options) {
  return options.map((option) => ({ ...option }));
}

function serviceKey(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["ride", "transport", "ride only"].includes(normalized)) return "ride";
  if (["delivery", "delivery only"].includes(normalized)) return "delivery";
  if (["both", "ride and delivery", "toprated", "top rated", "all", "any"].includes(normalized)) return "both";
  return normalized || "both";
}

export function getTransportCapabilities(context = {}) {
  const country = profileForContext(context);
  const iso2 = normalizeCountryIso(country);

  // Database capability arrays (hydrated by countryConfigService) win; the
  // static taxi-only country set is only the offline/first-paint fallback.
  const dbRideTypes = Array.isArray(country?.transport?.rideFleetTypes) ? country.transport.rideFleetTypes : [];
  const dbDeliveryTypes = Array.isArray(country?.transport?.deliveryFleetTypes) ? country.transport.deliveryFleetTypes : [];

  if (dbRideTypes.length || dbDeliveryTypes.length) {
    const rideOptions = optionsFromDbTypes(dbRideTypes, RIDE_OPTION_BY_DB_TYPE);
    const deliveryOptions = optionsFromDbTypes(dbDeliveryTypes, DELIVERY_OPTION_BY_DB_TYPE);

    return {
      country,
      iso2,
      taxiOnlyRide: rideOptions.length > 0 && rideOptions.every((option) => option.value === "Car"),
      rideOptions: rideOptions.length ? rideOptions : cloneOptions(FULL_RIDE_OPTIONS),
      deliveryOptions: deliveryOptions.length ? deliveryOptions : cloneOptions(FULL_DELIVERY_OPTIONS),
    };
  }

  const taxiOnlyRide = TAXI_ONLY_RIDE_COUNTRIES.has(iso2);

  return {
    country,
    iso2,
    taxiOnlyRide,
    rideOptions: cloneOptions(taxiOnlyRide ? TAXI_ONLY_RIDE_OPTIONS : FULL_RIDE_OPTIONS),
    deliveryOptions: cloneOptions(taxiOnlyRide ? TAXI_ONLY_DELIVERY_OPTIONS : FULL_DELIVERY_OPTIONS),
  };
}

export function getRideFleetOptions(context = {}) {
  return getTransportCapabilities(context).rideOptions;
}

export function getDeliveryFleetOptions(context = {}) {
  return getTransportCapabilities(context).deliveryOptions;
}

export function getPassengerFleetFilterOptions(context = {}, mode = "topRated", { includeAny = true } = {}) {
  const capabilities = getTransportCapabilities(context);
  const key = serviceKey(mode);
  const source = key === "ride"
    ? capabilities.rideOptions
    : key === "delivery"
      ? capabilities.deliveryOptions
      : [
          ...capabilities.rideOptions,
          ...capabilities.deliveryOptions,
        ];
  const byValue = new Map();

  source.forEach((option) => {
    if (!byValue.has(option.value)) {
      byValue.set(option.value, { ...option });
      return;
    }

    const current = byValue.get(option.value);
    if (current.label !== option.label) {
      current.label = option.value === "Car" ? "Taxi / van" : current.label;
      current.displayName = current.label;
    }
  });

  const options = Array.from(byValue.values());
  return includeAny ? [{ value: "", label: key === "delivery" ? "Any delivery fleet" : key === "ride" ? "Any ride fleet" : "Any active fleet" }, ...options] : options;
}

export function getPersonalServiceCategoryOptions(context = {}) {
  return getTransportCapabilities(context).taxiOnlyRide
    ? [...TAXI_ONLY_PERSONAL_SERVICE_CATEGORIES]
    : [...FULL_PERSONAL_SERVICE_CATEGORIES];
}

const PERSONAL_FLEET_ORDER = ["Car", "Motorcycle", "Tricycle"];

export function getPersonalFleetTypeOptions(context = {}, category = "Transport") {
  const capabilities = getTransportCapabilities(context);
  const key = serviceKey(category);
  const source = key === "ride"
    ? capabilities.rideOptions
    : key === "delivery"
      ? capabilities.deliveryOptions
      : [...capabilities.rideOptions, ...capabilities.deliveryOptions];

  const values = Array.from(new Set(source.map((option) => option.value)));
  return PERSONAL_FLEET_ORDER.filter((value) => values.includes(value));
}

export function getCompanyServiceCategoryOptions(context = {}) {
  return getTransportCapabilities(context).taxiOnlyRide
    ? [...TAXI_ONLY_COMPANY_SERVICE_CATEGORIES]
    : [...FULL_COMPANY_SERVICE_CATEGORIES];
}

const COMPANY_FLEET_ORDER = ["Motorbike", "Tricycle", "Taxi", "Van"];

export function getCompanyFleetTypeOptions(context = {}, serviceCategory = "Ride only") {
  const capabilities = getTransportCapabilities(context);
  const key = serviceKey(serviceCategory);
  // Delivery vans surface as companyValue "Van"; ride cars as "Taxi". Each
  // purpose only offers the fleet types the country actually allows for it.
  const source = key === "ride"
    ? capabilities.rideOptions
    : key === "delivery"
      ? capabilities.deliveryOptions
      : [...capabilities.rideOptions, ...capabilities.deliveryOptions];

  const values = Array.from(new Set(source.map((option) => option.companyValue)));
  return COMPANY_FLEET_ORDER.filter((value) => values.includes(value));
}

export function normalizeTransportFleetType(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["bike", "motorbike", "motorcycle", "okada"].includes(normalized)) return "Motorcycle";
  if (["keke", "tricycle", "auto", "autorickshaw"].includes(normalized)) return "Tricycle";
  if (["taxi", "car", "van", "bus", "minibus"].includes(normalized)) return "Car";
  return normalized ? value : "";
}

export function isFleetTypeAvailableForService(fleetType, mode = "topRated", context = {}) {
  const key = serviceKey(mode);
  const type = normalizeTransportFleetType(fleetType);
  const capabilities = getTransportCapabilities(context);
  const rideAllowed = capabilities.rideOptions.some((option) => option.value === type);
  const deliveryAllowed = capabilities.deliveryOptions.some((option) => option.value === type);

  if (key === "ride") return rideAllowed;
  if (key === "delivery") return deliveryAllowed;
  return rideAllowed || deliveryAllowed;
}

export function isFleetAllowedForTransportMode(fleet = {}, mode = "topRated", context = {}) {
  const key = serviceKey(mode);
  const service = serviceKey(fleet.serviceCategory || fleet.service_category);

  if (key === "ride" || key === "delivery") {
    return isFleetTypeAvailableForService(fleet.fleetType || fleet.fleet_type, key, context);
  }

  if (service === "ride") {
    return isFleetTypeAvailableForService(fleet.fleetType || fleet.fleet_type, "ride", context);
  }

  if (service === "delivery") {
    return isFleetTypeAvailableForService(fleet.fleetType || fleet.fleet_type, "delivery", context);
  }

  return isFleetTypeAvailableForService(fleet.fleetType || fleet.fleet_type, "topRated", context);
}

export function isMapFleetTypeVisible(type = "", context = {}) {
  const normalized = String(type || "").trim().toLowerCase();
  const mapToFleet = {
    bike: "Motorcycle",
    keke: "Tricycle",
    car: "Car",
    van: "Car",
  };
  const fleetType = mapToFleet[normalized] || normalizeTransportFleetType(type);
  const mode = normalized === "car" ? "ride" : normalized === "van" ? "delivery" : "topRated";

  return isFleetTypeAvailableForService(fleetType, mode, context);
}
