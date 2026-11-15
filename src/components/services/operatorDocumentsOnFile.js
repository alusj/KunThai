// Which of an operator's documents KunThai already holds, so no screen asks
// for the same document twice (a driving licence given when joining a
// company is the same licence a solo registration asks for, and the other way
// round). No Supabase or DOM access, so it is unit-tested.
// The operator documents UrRide registration asks for: [key, label, older label].
// Kept in step with URRIDE_DOCUMENT_REQUIREMENTS (globalDocumentRequirements.js)
// by operatorDocumentsOnFile.test.js.
export const OPERATOR_DOCUMENT_LABELS = [
  ["national_id", "National ID"],
  ["operator_photo", "Operator selfie/photo"],
  ["driver_or_rider_license", "Driver or rider license"],
  ["vehicle_registration", "Vehicle registration"],
  ["insurance_document", "Insurance document"],
  ["roadworthiness_certificate", "Road worthiness or inspection certificate"],
  ["passenger_interior_photo", "Passenger interior or seating photo"],
  ["delivery_storage_photo", "Delivery box, bag, or storage photo"],
  ["item_handling_agreement", "Item handling agreement"],
];

export const LICENCE_REQUIREMENT_KEY = "driver_or_rider_license";

const REQUIREMENT_KEYS = new Set(OPERATOR_DOCUMENT_LABELS.map(([key]) => key));
const KEY_BY_LABEL = new Map(OPERATOR_DOCUMENT_LABELS.flatMap(([key, ...labels]) =>
  labels.map((label) => [label.toLowerCase(), key])));

function parseMetadata(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}") || {};
  } catch {
    return {};
  }
}

// The registration requirement a saved document row answers ("" when none).
export function documentRequirementKey(row = {}) {
  const fieldKey = String(parseMetadata(row.metadata).fieldKey || "");
  // The company-invitation screen saves the licence under "license".
  if (fieldKey === "license") return LICENCE_REQUIREMENT_KEY;
  if (fieldKey.startsWith("doc-")) {
    const rest = fieldKey.slice(4);
    if (REQUIREMENT_KEYS.has(rest)) return rest;
    const byLabel = KEY_BY_LABEL.get(rest.toLowerCase());
    if (byLabel) return byLabel;
  }
  const type = String(row.document_type || row.documentType || "").trim().toLowerCase();
  if (KEY_BY_LABEL.has(type)) return KEY_BY_LABEL.get(type);
  if (REQUIREMENT_KEYS.has(type)) return type;
  if (/licen[cs]e/.test(type)) return LICENCE_REQUIREMENT_KEY;
  return "";
}

// A rejected document has to be sent again; anything else is on file.
function isOnFile(row = {}) {
  const hasFile = Boolean(row.file_name || row.fileName || row.file_url || row.document_url);
  return hasFile && String(row.status || "").toLowerCase() !== "rejected";
}

export function summarizeDocumentsOnFile(rows = []) {
  const byRequirement = {};
  for (const row of rows || []) {
    if (!isOnFile(row)) continue;
    const key = documentRequirementKey(row);
    if (!key || byRequirement[key]) continue;
    byRequirement[key] = {
      fileName: row.file_name || row.fileName || "",
      status: String(row.status || ""),
      uploadedAt: row.uploaded_at || row.uploadedAt || "",
    };
  }
  return {
    byRequirement,
    count: Object.keys(byRequirement).length,
    licenceOnFile: Boolean(byRequirement[LICENCE_REQUIREMENT_KEY]),
  };
}

export const NO_DOCUMENTS_ON_FILE = Object.freeze({
  operatorId: "",
  userId: "",
  phone: "",
  byRequirement: Object.freeze({}),
  count: 0,
  licenceOnFile: false,
});
