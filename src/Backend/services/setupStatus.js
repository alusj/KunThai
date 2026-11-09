// What a seller, operator or fleet company still has to finish, and which
// section of their edit screen each missing item lives in. The dashboards
// (setup card) and the edit screens ("This needs attention") read the same
// rules, so they can never disagree.

const SELLER_SECTIONS = {
  "business-name": "identity",
  categories: "identity",
  description: "identity",
  logo: "identity",
  country: "location",
  city: "location",
  address: "location",
  phone: "location",
  coordinates: "location",
  "business-type": "operations",
  "vendor-type": "operations",
  "selling-unit": "operations",
  "minimum-order": "operations",
  "lead-time": "operations",
  fulfillment: "operations",
  "open-time": "operations",
  "close-time": "operations",
};

/** Sections of the store editor with something missing (from getReadinessChecklist). */
export function sellerSectionsNeedingAttention(checklist = []) {
  const sections = new Set();
  for (const item of checklist) {
    if (item.complete) continue;
    sections.add(String(item.key || "").startsWith("document-") ? "trustPayout" : SELLER_SECTIONS[item.key] || "identity");
  }
  return sections;
}

export function operatorSetupChecklist(form = {}, documentsSkipped = false) {
  return [
    { id: "name", section: "operator", complete: Boolean(form.name) },
    { id: "phone", section: "operator", complete: Boolean(form.phone) },
    { id: "cityBase", section: "operator", complete: Boolean(form.city || form.homeBaseLocation || form.operatingArea) },
    { id: "vehicleType", section: "service", complete: Boolean(form.fleetType) },
    { id: "plate", section: "fleet", complete: Boolean(form.plateNumber) },
    { id: "makeModel", section: "fleet", complete: Boolean(form.make && form.model) },
    { id: "pricing", section: "fleet", complete: [form.baseFare, form.pricePerKm, form.pricePerHour].some((value) => Number(value || 0) > 0) },
    { id: "documents", section: "documents", complete: !documentsSkipped },
  ];
}

export function companySetupChecklist({ company = {}, operatingAreas = [], fleetCount = 0, operatorCount = 0 } = {}) {
  return [
    { id: "name", section: "profile", complete: Boolean(company.companyName) },
    { id: "type", section: "profile", complete: Boolean(company.companyType) },
    { id: "documents", section: "profile", complete: Object.keys(company.documents || {}).length > 0 },
    { id: "base", section: "base", complete: Boolean(company.city || company.address) },
    { id: "areas", section: "base", complete: operatingAreas.length > 0 },
    { id: "policy", section: "base", complete: Boolean(company.supportPolicy) },
    { id: "fleet", section: "fleets", complete: fleetCount > 0 },
    { id: "operator", section: "fleets", complete: operatorCount > 0 },
  ];
}

export function sectionsNeedingAttention(checklist = []) {
  return new Set(checklist.filter((item) => !item.complete).map((item) => item.section));
}

export function setupScore(checklist = []) {
  if (!checklist.length) return 100;
  return Math.round((checklist.filter((item) => item.complete).length / checklist.length) * 100);
}

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const VERIFIED_STATUSES = new Set(["verified", "approved", "recommended", "verified_recommended"]);
const BLOCKED_STATUSES = new Set(["rejected", "declined", "suspended", "not_verified", "notverified", "needs_information", "request_information", "information_requested"]);

export function isVerifiedStatus(status) {
  return VERIFIED_STATUSES.has(normalizeStatus(status));
}

/**
 * Everything is submitted: the setup card goes away and the Trusted tag shows.
 * It does not wait for KunThai's review, but a refused or suspended profile
 * is not Trusted.
 */
export function isTrustedSetup(complete, verificationStatus) {
  return Boolean(complete) && !BLOCKED_STATUSES.has(normalizeStatus(verificationStatus));
}
