// Shared vocabulary for the admin operations platform: enforcement targets,
// capabilities, reason codes, statuses and the staff career ladder. Every key
// here mirrors a value the database validates in
// supabase/migrations/20261001150000_admin_operations_platform.sql — the UI
// never invents a state the backend does not know about.

import { sectorAuthorityLevel } from "./adminCaseRules.js";

export const TARGET_TYPES = Object.freeze({
  marketplace_business: {
    key: "marketplace_business",
    noun: "business",
    title: "UrMall businesses",
    sector: "marketplace",
    permissionPrefix: "marketplace.businesses",
    ownerScreen: "urmall:business",
  },
  transport_operator: {
    key: "transport_operator",
    noun: "operator",
    title: "UrRide operators",
    sector: "transport",
    permissionPrefix: "transport.operators",
    ownerScreen: "urride:operator-dashboard",
  },
  transport_company: {
    key: "transport_company",
    noun: "company",
    title: "UrRide companies",
    sector: "transport",
    permissionPrefix: "transport.companies",
    ownerScreen: "urride:company-dashboard",
  },
});

// What a restriction can switch off, per target type (admin_enforcement_capabilities).
export const CAPABILITIES = Object.freeze({
  marketplace_business: [
    { key: "listings", label: "Listings", detail: "Cannot add or edit products, menu items, rooms or property listings." },
    { key: "orders", label: "New orders", detail: "Buyers cannot place new orders or bookings." },
    { key: "promotions", label: "Promotions", detail: "Cannot create or change promotions." },
    { key: "messaging", label: "Customer messaging", detail: "Cannot send messages to customers." },
    { key: "discovery", label: "Discovery", detail: "Hidden from search, browse and the store page." },
  ],
  transport_operator: [
    { key: "trips", label: "Trips", detail: "Cannot receive or accept new trips, including open bookings." },
    { key: "discovery", label: "Discovery", detail: "Vehicles are hidden from passengers." },
  ],
  transport_company: [
    { key: "trips", label: "Trips", detail: "No vehicle in the company can receive or accept new trips." },
    { key: "discovery", label: "Discovery", detail: "Company vehicles are hidden from passengers." },
    { key: "operators", label: "Operator invites", detail: "Cannot invite new operators." },
  ],
});

export const ENFORCEMENT_REASONS = Object.freeze([
  { key: "fraud_scam", label: "Fraud or scam" },
  { key: "counterfeit_prohibited", label: "Counterfeit or prohibited items" },
  { key: "safety_violation", label: "Safety violation" },
  { key: "spam", label: "Spam" },
  { key: "harassment", label: "Harassment" },
  { key: "misleading_information", label: "Misleading information" },
  { key: "repeated_violations", label: "Repeated policy violations" },
  { key: "identity_verification", label: "Identity or verification issue" },
  { key: "other", label: "Other" },
]);

export const RESTORATION_REASONS = Object.freeze([
  { key: "issue_resolved", label: "Issue resolved" },
  { key: "appeal_upheld", label: "Appeal upheld" },
  { key: "error_correction", label: "Correcting an error" },
  { key: "policy_update", label: "Policy changed" },
  { key: "other", label: "Other" },
]);

const REASON_LABELS = new Map([...ENFORCEMENT_REASONS, ...RESTORATION_REASONS, { key: "expired", label: "Period ended" }].map((item) => [item.key, item.label]));

export function reasonLabel(key) {
  return REASON_LABELS.get(key) || key || "Not recorded";
}

// Actions in increasing severity. minAuthority mirrors admin_apply_enforcement.
export const ENFORCEMENT_ACTIONS = Object.freeze({
  warning: { key: "warning", label: "Issue warning", permission: "enforce", minAuthority: 1, tone: "amber", needsNote: false },
  restriction: { key: "restriction", label: "Restrict", permission: "enforce", minAuthority: 2, tone: "orange", needsNote: true },
  temporary_suspension: { key: "temporary_suspension", label: "Temporarily suspend", permission: "suspend", minAuthority: 3, tone: "red", needsNote: true },
  suspension: { key: "suspension", label: "Suspend", permission: "suspend", minAuthority: 4, tone: "red", needsNote: true },
  restoration: { key: "restoration", label: "Restore", permission: "enforce", minAuthority: 1, tone: "emerald", needsNote: false },
});

export const ENFORCEMENT_STATUS = Object.freeze({
  active: { label: "Active", tone: "emerald" },
  restricted: { label: "Restricted", tone: "orange" },
  temporarily_suspended: { label: "Temporarily suspended", tone: "red" },
  suspended: { label: "Suspended", tone: "red" },
});

export const HISTORY_ACTION_LABELS = Object.freeze({
  warning: "Warning",
  restriction: "Restriction",
  temporary_suspension: "Temporary suspension",
  suspension: "Suspension",
  restoration: "Restoration",
});

// Temporary-suspension and restriction durations offered in the dialog.
export const DURATION_OPTIONS = Object.freeze([
  { key: "24h", label: "24 hours", hours: 24 },
  { key: "3d", label: "3 days", hours: 72 },
  { key: "7d", label: "7 days", hours: 168 },
  { key: "14d", label: "14 days", hours: 336 },
  { key: "30d", label: "30 days", hours: 720 },
  { key: "90d", label: "90 days", hours: 2160 },
]);

export function durationEndsAt(durationKey, from = new Date()) {
  const option = DURATION_OPTIONS.find((item) => item.key === durationKey);
  if (!option) return null;
  return new Date(from.getTime() + option.hours * 3600 * 1000).toISOString();
}

// Which actions an admin can take on a target right now, given their access
// and the target's current status. Authority is the admin's level in the
// target's sector (admin_authority_level(sector)), not their highest level
// anywhere. The server re-checks every one of these.
export function availableEnforcementActions(access, targetType, currentStatus = "active") {
  const target = TARGET_TYPES[targetType];
  if (!target || !access) return [];
  const permissions = new Set(access.permissions || []);
  const authority = sectorAuthorityLevel(access, target.sector);
  const can = (kind) => permissions.has(`${target.permissionPrefix}.${kind}`);
  const suspended = currentStatus === "suspended" || currentStatus === "temporarily_suspended";

  return Object.values(ENFORCEMENT_ACTIONS).filter((action) => {
    if (authority < action.minAuthority) return false;
    if (action.key === "restoration") {
      if (currentStatus === "active") return false;
      return suspended ? can("suspend") : can("enforce") || can("suspend");
    }
    return can(action.permission);
  });
}

export function canNotifyOwner(access, targetType) {
  const target = TARGET_TYPES[targetType];
  const permissions = new Set(access?.permissions || []);
  return Boolean(target && permissions.has("notifications.direct") && permissions.has(`${target.permissionPrefix}.view`));
}

export function canWriteNotes(access, targetType) {
  const target = TARGET_TYPES[targetType];
  const permissions = new Set(access?.permissions || []);
  return Boolean(target && (permissions.has(`${target.permissionPrefix}.enforce`) || permissions.has(`${target.permissionPrefix}.suspend`)));
}

// Client-side mirror of the server's input rules, so mistakes are caught
// before a round trip. Returns an error message or "".
export function validateEnforcementInput({ action, reasonCode, publicMessage, internalNote, capabilities = [], endsAt } = {}) {
  const spec = ENFORCEMENT_ACTIONS[action];
  if (!spec) return "Choose an action.";
  if (!reasonCode) return action === "restoration" ? "Choose a restoration reason." : "Choose a reason category.";
  if (String(publicMessage || "").trim().length < 10) return "Explain the decision to the owner (at least 10 characters).";
  if (spec.needsNote && String(internalNote || "").trim().length < 5) return "Add an internal note (at least 5 characters).";
  if (action === "restriction" && !capabilities.length) return "Choose at least one capability to restrict.";
  if (action === "temporary_suspension" && !endsAt) return "Choose how long the suspension lasts.";
  if (endsAt && new Date(endsAt).getTime() <= Date.now()) return "The end time must be in the future.";
  return "";
}

// --- Staff career ladder (admin_staff_levels) --------------------------------

export const STAFF_LEVELS = Object.freeze([
  { key: "associate", name: "Associate", rank: 1, maxAuthority: 1 },
  { key: "specialist", name: "Specialist", rank: 2, maxAuthority: 2 },
  { key: "senior_specialist", name: "Senior Specialist", rank: 3, maxAuthority: 2 },
  { key: "lead", name: "Team Lead", rank: 4, maxAuthority: 3 },
  { key: "manager", name: "Manager", rank: 5, maxAuthority: 4 },
  { key: "senior_manager", name: "Senior Manager", rank: 6, maxAuthority: 4 },
  { key: "director", name: "Director", rank: 7, maxAuthority: 5 },
  { key: "executive", name: "Executive", rank: 8, maxAuthority: 5 },
]);

export const STAFF_DEPARTMENTS = Object.freeze([
  { key: "operations", label: "Operations" },
  { key: "trust_safety", label: "Trust & Safety" },
  { key: "commerce", label: "Commerce (UrMall)" },
  { key: "mobility", label: "Mobility (UrRide)" },
  { key: "customer_support", label: "Customer Support" },
  { key: "finance", label: "Finance" },
  { key: "growth_marketing", label: "Growth & Marketing" },
  { key: "engineering", label: "Engineering" },
  { key: "compliance_audit", label: "Compliance & Audit" },
  { key: "executive", label: "Executive" },
]);

export const STAFF_STATUS = Object.freeze({
  active: { label: "Active", tone: "emerald", detail: "Full access for their roles." },
  restricted: { label: "Restricted", tone: "orange", detail: "View-only: can read but not take any action." },
  suspended: { label: "Suspended", tone: "red", detail: "No admin access until restored or the end time passes." },
  deactivated: { label: "Deactivated", tone: "zinc", detail: "Access ended (e.g. left KunThai). Requires authority 4." },
});

export function departmentLabel(key) {
  return STAFF_DEPARTMENTS.find((item) => item.key === key)?.label || key || "Unassigned";
}

// Levels this admin may assign: strictly below their own (Super Admins: all).
export function assignableStaffLevels(access) {
  if (access?.roles?.some((role) => role.key === "super_admin")) return [...STAFF_LEVELS];
  const ownRank = Number(access?.staff?.levelRank || 0);
  return STAFF_LEVELS.filter((level) => level.rank < ownRank);
}

export function canManageStaffMember(access, member, currentUserId = "") {
  if (!access?.permissions?.includes("team.manage") || !member) return false;
  if (currentUserId && member.user_id === currentUserId) return false;
  if (access.roles?.some((role) => role.key === "super_admin")) return true;
  if ((member.roles || []).some((role) => ["super_admin", "chief_admin"].includes(role.key))) return false;
  return Number(member.level_rank || 0) < Number(access?.staff?.levelRank || 0);
}

// --- Directory filters --------------------------------------------------------

export const BUSINESS_KINDS = Object.freeze([
  { key: "retail", label: "Retail" },
  { key: "vendor", label: "Vendor" },
  { key: "restaurant", label: "Restaurant" },
  { key: "property_agent", label: "Real estate" },
  { key: "hotel", label: "Hotel (legacy)" },
]);

export function businessKindLabel(key) {
  return BUSINESS_KINDS.find((item) => item.key === key)?.label || key || "Retail";
}

export const ENFORCEMENT_FILTER_OPTIONS = Object.freeze(
  Object.entries(ENFORCEMENT_STATUS).map(([key, value]) => ({ key, label: value.label })),
);

export const VERIFICATION_FILTER_OPTIONS = Object.freeze([
  { key: "pending", label: "Pending" },
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under review" },
  { key: "approved", label: "Approved" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
]);

export const ACCOUNT_STATUS_FILTER_OPTIONS = Object.freeze([
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Suspended (registration)" },
  { key: "archived", label: "Archived" },
]);

export const SORT_OPTIONS = Object.freeze({
  marketplace_business: [
    { key: "newest", label: "Newest" },
    { key: "oldest", label: "Oldest" },
    { key: "recently_active", label: "Recently active" },
    { key: "name_asc", label: "Name A–Z" },
    { key: "name_desc", label: "Name Z–A" },
    { key: "most_listings", label: "Most listings" },
    { key: "most_orders", label: "Most orders" },
  ],
  transport_operator: [
    { key: "newest", label: "Newest" },
    { key: "oldest", label: "Oldest" },
    { key: "recently_active", label: "Most recent trip" },
    { key: "name_asc", label: "Name A–Z" },
    { key: "name_desc", label: "Name Z–A" },
    { key: "most_trips", label: "Most trips" },
  ],
  transport_company: [
    { key: "newest", label: "Newest" },
    { key: "oldest", label: "Oldest" },
    { key: "recently_active", label: "Recently active" },
    { key: "name_asc", label: "Name A–Z" },
    { key: "name_desc", label: "Name Z–A" },
    { key: "most_operators", label: "Most operators" },
    { key: "most_trips", label: "Most trips" },
  ],
});

// Read/write filters in the URL hash query (#/urmall-businesses?status=suspended)
// so dashboard cards can deep-link into a filtered directory.
export function parseHashQuery(hash = "") {
  const query = String(hash).split("?")[1] || "";
  const params = new URLSearchParams(query);
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value.includes(",") ? value.split(",").filter(Boolean) : value;
  }
  return result;
}

export function buildHashQuery(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
    } else if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function toArrayFilter(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

// Display name of a directory record.
export function targetLabel(targetType, record) {
  if (targetType === "marketplace_business") return record.business_name || "UrMall business";
  if (targetType === "transport_operator") return record.full_name || record.operator_code || "UrRide operator";
  return record.company_name || "UrRide company";
}

// --- Directory RPC arguments ---------------------------------------------------

const nullable = (value) => (value === undefined || value === "" ? null : value);
const arrayOrNull = (value) => (Array.isArray(value) && value.length ? value : null);

// Turns UI filter state into the exact RPC argument names for each list.
export function buildDirectoryArgs(targetType, filters = {}, { page = 0, pageSize = 25 } = {}) {
  const base = {
    p_search: nullable(String(filters.search || "").trim()),
    p_enforcement: arrayOrNull(filters.status),
    p_verification: arrayOrNull(filters.verification),
    p_country: nullable(filters.country),
    p_city: nullable(filters.city),
    p_created_from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : null,
    p_created_to: filters.to ? new Date(new Date(`${filters.to}T00:00:00`).getTime() + 86400000).toISOString() : null,
    p_sort: filters.sort || "newest",
    p_limit: pageSize,
    p_offset: Math.max(0, page) * pageSize,
  };
  if (targetType === "marketplace_business") {
    return { ...base, p_kinds: arrayOrNull(filters.kind) };
  }
  if (targetType === "transport_operator") {
    return {
      ...base,
      p_account_status: arrayOrNull(filters.account),
      p_fleet_type: nullable(filters.fleetType),
      p_service: nullable(filters.service),
    };
  }
  return { ...base, p_account_status: arrayOrNull(filters.account), p_service: nullable(filters.service) };
}
