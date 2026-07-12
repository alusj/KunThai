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

// Hydrated copy of public.kunthai_document_requirements. The database is the
// source of truth (and enforces required documents on approval); the static
// lists above are only the offline/first-paint fallback.
let RUNTIME_REQUIREMENTS = null;

function normalizeDbRequirement(row) {
  const key = row?.field_key || row?.key;
  if (!row?.surface || !key) return null;

  return {
    surface: String(row.surface).toLowerCase(),
    group: String(row.requirement_group || row.group || "").toLowerCase(),
    countryIso: String(row.country_iso || GLOBAL_COUNTRY_SCOPE).toUpperCase() === GLOBAL_COUNTRY_SCOPE
      ? GLOBAL_COUNTRY_SCOPE
      : String(row.country_iso).toUpperCase(),
    key,
    label: row.label || key,
    legacyLabel: row.legacy_label || row.label || "",
    ...(row.legacy_document_type ? { legacyDocumentType: row.legacy_document_type } : {}),
    ...(row.file_field ? { fileField: row.file_field } : {}),
    ...(row.name_field ? { nameField: row.name_field } : {}),
    ...(row.error_key ? { errorKey: row.error_key } : {}),
    ...(row.public_media_role ? { publicMediaRole: row.public_media_role } : {}),
    inlineNote: row.inline_note ?? IF_APPLICABLE_NOTE,
    required: row.required !== false,
    appliesToCategories: Array.isArray(row.applies_to_categories) ? row.applies_to_categories : [],
    sortOrder: Number(row.sort_order ?? 100),
  };
}

export function applyDocumentRequirementOverrides(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const normalized = rows.map(normalizeDbRequirement).filter(Boolean);
  if (!normalized.length) return 0;
  RUNTIME_REQUIREMENTS = normalized;
  return normalized.length;
}

// Mirrors kunthai_get_document_requirements: a country-specific row overrides
// the '*' global row with the same surface/group/field key.
function resolveRuntimeRequirements(surface, group, context = {}) {
  if (!RUNTIME_REQUIREMENTS) return null;

  const iso2 = normalizeCountryIso(context.countryCode || context.country);
  const scoped = RUNTIME_REQUIREMENTS.filter((requirement) =>
    requirement.surface === surface &&
      requirement.group === group &&
      (requirement.countryIso === GLOBAL_COUNTRY_SCOPE || (iso2 && requirement.countryIso === iso2)),
  );
  if (!scoped.length) return null;

  const byKey = new Map();
  for (const requirement of scoped) {
    const existing = byKey.get(requirement.key);
    if (!existing || (existing.countryIso === GLOBAL_COUNTRY_SCOPE && requirement.countryIso !== GLOBAL_COUNTRY_SCOPE)) {
      byKey.set(requirement.key, requirement);
    }
  }

  return Array.from(byKey.values()).sort(
    (first, second) => first.sortOrder - second.sortOrder || first.label.localeCompare(second.label),
  );
}

export function getUrRideFleetImageRequirements(context = {}) {
  return (
    resolveRuntimeRequirements("urride", "fleet_image", context) ||
    URRIDE_FLEET_IMAGE_REQUIREMENTS.filter((requirement) =>
      appliesToCountry(requirement, context.countryCode || context.country),
    )
  );
}

export function getUrRideCompanyDocumentRequirements(context = {}) {
  return (
    resolveRuntimeRequirements("urride", "company", context) ||
    URRIDE_COMPANY_DOCUMENT_REQUIREMENTS.filter((requirement) =>
      appliesToCountry(requirement, context.countryCode || context.country),
    )
  );
}

export function getUrRideDocumentRequirements(context = {}) {
  const source =
    resolveRuntimeRequirements("urride", "operator", context) ||
    URRIDE_DOCUMENT_REQUIREMENTS.filter((requirement) =>
      appliesToCountry(requirement, context.countryCode || context.country),
    );

  return source.filter((requirement) => appliesToCategory(requirement, context.category));
}

export function getUrMallDocumentRequirements(context = {}) {
  return (
    resolveRuntimeRequirements("urmall", "seller", context) ||
    URMALL_DOCUMENT_REQUIREMENTS.filter((requirement) =>
      appliesToCountry(requirement, context.countryCode || context.country),
    )
  );
}
