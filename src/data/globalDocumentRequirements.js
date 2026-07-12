import { normalizeCountryIso } from "./globalCountryProfiles";

export const IF_APPLICABLE_NOTE = "if applicable";

const GLOBAL_COUNTRY_SCOPE = "*";

function normalizeCategory(value = "") {
  return String(value || "").trim().toLowerCase();
}

function appliesToCategory(requirement, category = "") {
  const categories = requirement.appliesToCategories || [];
  if (!categories.length) return true;
  const normalizedCategory = normalizeCategory(category);
  return categories.some((item) => normalizeCategory(item) === normalizedCategory);
}

function appliesToCountry(requirement, country = "") {
  const iso2 = normalizeCountryIso(country);
  const countries = requirement.countries || [GLOBAL_COUNTRY_SCOPE];
  return countries.includes(GLOBAL_COUNTRY_SCOPE) || countries.includes(iso2);
}

export function formatDocumentRequirementLabel(requirement) {
  const label = requirement?.label || "";
  const inlineNote = requirement?.inlineNote || "";
  return inlineNote ? `${label} (${inlineNote})` : label;
}

export const URRIDE_FLEET_IMAGE_REQUIREMENTS = Object.freeze([
  { key: "front_view", label: "Front view", legacyLabel: "Front view", inlineNote: IF_APPLICABLE_NOTE, required: true },
  { key: "back_view", label: "Back view", legacyLabel: "Back view", inlineNote: IF_APPLICABLE_NOTE, required: true },
  { key: "left_side", label: "Left side", legacyLabel: "Left side", inlineNote: IF_APPLICABLE_NOTE, required: true },
  { key: "right_side", label: "Right side", legacyLabel: "Right side", inlineNote: IF_APPLICABLE_NOTE, required: true },
]);

export const URRIDE_COMPANY_DOCUMENT_REQUIREMENTS = Object.freeze([
  { key: "business_registration", label: "Business registration", legacyLabel: "Business registration", inlineNote: IF_APPLICABLE_NOTE, required: true },
  { key: "transport_permit", label: "Transport permit", legacyLabel: "Transport permit", inlineNote: IF_APPLICABLE_NOTE, required: true },
  { key: "tax_or_business_id", label: "Tax or business ID", legacyLabel: "Tax or business ID", inlineNote: IF_APPLICABLE_NOTE, required: true },
  { key: "owner_national_id", label: "Owner national ID", legacyLabel: "Owner national ID", inlineNote: IF_APPLICABLE_NOTE, required: true },
]);

export const URRIDE_DOCUMENT_REQUIREMENTS = Object.freeze([
  {
    key: "national_id",
    label: "National ID",
    legacyLabel: "National ID",
    inlineNote: IF_APPLICABLE_NOTE,
    required: true,
  },
  {
    key: "operator_photo",
    label: "Operator selfie/photo",
    legacyLabel: "Operator selfie/photo",
    inlineNote: IF_APPLICABLE_NOTE,
    required: true,
    publicMediaRole: "operator_photo",
  },
  {
    key: "driver_or_rider_license",
    label: "Driver or rider license",
    legacyLabel: "Driver or rider license",
    inlineNote: IF_APPLICABLE_NOTE,
    required: true,
  },
  {
    key: "vehicle_registration",
    label: "Vehicle registration",
    legacyLabel: "Vehicle registration",
    inlineNote: IF_APPLICABLE_NOTE,
    required: true,
  },
  {
    key: "insurance_document",
    label: "Insurance document",
    legacyLabel: "Insurance document",
    inlineNote: IF_APPLICABLE_NOTE,
    required: true,
  },
  {
    key: "roadworthiness_certificate",
    label: "Road worthiness or inspection certificate",
    legacyLabel: "Road worthiness or inspection certificate",
    inlineNote: IF_APPLICABLE_NOTE,
    required: true,
    appliesToCategories: ["Transport", "Both"],
  },
  {
    key: "passenger_interior_photo",
    label: "Passenger interior or seating photo",
    legacyLabel: "Passenger interior or seating photo",
    inlineNote: IF_APPLICABLE_NOTE,
    required: true,
    appliesToCategories: ["Transport", "Both"],
  },
  {
    key: "delivery_storage_photo",
    label: "Delivery box, bag, or storage photo",
    legacyLabel: "Delivery box, bag, or storage photo",
    inlineNote: IF_APPLICABLE_NOTE,
    required: true,
    appliesToCategories: ["Delivery", "Both"],
  },
  {
    key: "item_handling_agreement",
    label: "Item handling agreement",
    legacyLabel: "Item handling agreement",
    inlineNote: IF_APPLICABLE_NOTE,
    required: true,
    appliesToCategories: ["Delivery", "Both"],
  },
]);

export const URMALL_DOCUMENT_REQUIREMENTS = Object.freeze([
  {
    key: "owner_identity",
    label: "Owner/representative ID",
    legacyDocumentType: "id",
    fileField: "idDocumentFile",
    nameField: "idDocumentName",
    errorKey: "idDocument",
    inlineNote: IF_APPLICABLE_NOTE,
    required: true,
  },
  {
    key: "business_registration",
    label: "Business registration document",
    legacyDocumentType: "business",
    fileField: "businessDocumentFile",
    nameField: "businessDocumentName",
    errorKey: "businessDocument",
    inlineNote: IF_APPLICABLE_NOTE,
    required: true,
  },
]);

export function getUrRideFleetImageRequirements(context = {}) {
  return URRIDE_FLEET_IMAGE_REQUIREMENTS.filter((requirement) =>
    appliesToCountry(requirement, context.countryCode || context.country),
  );
}

export function getUrRideCompanyDocumentRequirements(context = {}) {
  return URRIDE_COMPANY_DOCUMENT_REQUIREMENTS.filter((requirement) =>
    appliesToCountry(requirement, context.countryCode || context.country),
  );
}

export function getUrRideDocumentRequirements(context = {}) {
  return URRIDE_DOCUMENT_REQUIREMENTS.filter((requirement) =>
    appliesToCountry(requirement, context.countryCode || context.country) &&
      appliesToCategory(requirement, context.category),
  );
}

export function getUrMallDocumentRequirements(context = {}) {
  return URMALL_DOCUMENT_REQUIREMENTS.filter((requirement) =>
    appliesToCountry(requirement, context.countryCode || context.country),
  );
}
