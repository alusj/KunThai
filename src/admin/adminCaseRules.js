// Pure rules shared by the admin console: case lists, counters, per-sector
// authority, decision capabilities and date-input conversion. No imports, so
// the same code runs in the browser and under `node --test`.

export const CLOSED_CASE_STATUSES = Object.freeze(["resolved", "closed"]);
export const CASE_DECISION_KEYS = Object.freeze(["approve", "reject", "dismiss", "remove", "restrict", "suspend", "resolve", "request_information"]);
export const CASE_SECTORS = Object.freeze(["explore", "marketplace", "transport"]);
export const CASE_QUEUES = Object.freeze(["verification", "reports", "support", "finance"]);

// English sources for fallback reasons. They also live in the translation
// bundles (adminCases.*), so uiText() renders them in the admin's language.
export const DECISION_REASONS = Object.freeze({
  noManage: "You do not have case management access in this sector.",
  authority: "This decision needs authority level 3 in this sector.",
});

// Mirrors admin_apply_case_decision: these need authority 3 in the case sector.
const AUTHORITY_3_DECISIONS = new Set(["approve", "reject", "remove", "restrict", "suspend"]);
// …and these are parked for a second admin's approval unless a Super Admin applies them.
const APPROVAL_DECISIONS = new Set(["remove", "suspend"]);
const ACCOUNT_DELETION_RESOURCES = new Set(["urmall_account_deletion_request", "urride_account_deletion_request"]);

export function isOpenCase(item) {
  return Boolean(item) && !CLOSED_CASE_STATUSES.includes(item.status);
}

export function openCases(cases = []) {
  return cases.filter(isOpenCase);
}

// --- Loading and merging ----------------------------------------------------

// Merge case lists, newest version of each id wins (later lists override
// earlier ones), sorted newest first.
export function mergeCaseLists(...lists) {
  const byId = new Map();
  lists.flat().forEach((item) => {
    if (!item?.id) return;
    byId.set(item.id, byId.has(item.id) ? { ...byId.get(item.id), ...item } : item);
  });
  return Array.from(byId.values()).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

// Page through a range-based fetcher until a short page comes back.
// fetchPage(from, to) must resolve to an array of rows.
export async function fetchAllPages(fetchPage, { pageSize = 1000, maxPages = 100 } = {}) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const batch = (await fetchPage(from, from + pageSize - 1)) || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

// --- Counters ---------------------------------------------------------------

export function buildCaseSummary(cases = [], now = new Date()) {
  const open = openCases(cases);
  return {
    openCases: open.length,
    urgentCases: open.filter((item) => ["urgent", "critical"].includes(item.priority)).length,
    unassignedCases: open.filter((item) => !item.assignee_user_id).length,
    overdueCases: open.filter((item) => item.sla_due_at && new Date(item.sla_due_at) < now).length,
    bySector: Object.fromEntries(CASE_SECTORS.map((sector) => [sector, open.filter((item) => item.sector === sector).length])),
    byQueue: Object.fromEntries(CASE_QUEUES.map((queue) => [queue, open.filter((item) => item.queue === queue).length])),
  };
}

// The server summary counts every case the admin may see, so it wins. Local
// counts are used only when a country filter is active (the server cannot
// filter by country) or for values the server did not return.
export function resolveCaseSummary(serverSummary = {}, cases = [], { countryFiltered = false, now = new Date() } = {}) {
  const local = buildCaseSummary(cases, now);
  const server = serverSummary || {};
  if (countryFiltered) return { ...server, ...local, resolvedToday: server.resolvedToday };
  const pick = (key) => (typeof server[key] === "number" ? server[key] : local[key]);
  return {
    ...local,
    ...server,
    openCases: pick("openCases"),
    urgentCases: pick("urgentCases"),
    unassignedCases: pick("unassignedCases"),
    overdueCases: pick("overdueCases"),
    bySector: { ...local.bySector, ...(server.bySector || {}) },
    byQueue: { ...local.byQueue, ...(server.byQueue || {}) },
  };
}

// Lane counters on a sector page: open cases only.
export function sectorLaneCounts(cases = [], sector) {
  const open = openCases(cases).filter((item) => item.sector === sector);
  return [open.length, ...CASE_QUEUES.slice(0, 3).map((queue) => open.filter((item) => item.queue === queue).length)];
}

// --- My work ----------------------------------------------------------------

export function isMyWorkCase(item, userId) {
  if (!item) return false;
  return !item.assignee_user_id || (Boolean(userId) && item.assignee_user_id === userId);
}

export function filterMyWork(cases = [], userId) {
  return cases.filter((item) => isMyWorkCase(item, userId));
}

// --- Server search ----------------------------------------------------------

// PostgREST or() filter for title/description ilike. LIKE wildcards are
// escaped, and the value is double-quoted so commas, dots, colons and
// parentheses cannot break the or() grammar.
export function buildCaseSearchOrFilter(text = "") {
  const query = String(text || "").trim().slice(0, 120);
  if (!query) return "";
  const like = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  const quoted = `%${like}%`.replace(/[\\"]/g, (char) => `\\${char}`);
  const filters = [`title.ilike."${quoted}"`, `description.ilike."${quoted}"`];
  const number = /^(?:kt-?)?0*(\d{1,12})$/i.exec(query.replace(/\s+/g, ""));
  if (number) filters.push(`case_number.eq.${Number(number[1])}`);
  return filters.join(",");
}

// --- Authority and decisions ------------------------------------------------

export function isSuperAdmin(access) {
  return Boolean(access?.roles?.some((role) => (role.key || role.role_key) === "super_admin"));
}

function roleCoversSector(role, sector) {
  const sectors = role?.sectors || role?.sector_scopes || [];
  return !sector || sectors.includes("all") || sectors.includes(sector);
}

// Authority in one sector, mirroring admin_authority_level(sector): the
// highest assignment authority among roles covering that sector, capped by the
// staff level. The overall authorityLevel (already 0 for restricted staff) is
// an upper bound. Without per-role data we fall back to the overall level.
export function sectorAuthorityLevel(access, sector) {
  if (!access) return 0;
  const overall = Number(access.authorityLevel || 0);
  const roles = (access.roles || []).filter((role) => role && role.authorityLevel !== undefined && role.authorityLevel !== null);
  if (!roles.length) return overall;
  const cap = Number(access.staff?.maxAuthority ?? 5) || 5;
  const sectorLevel = roles
    .filter((role) => roleCoversSector(role, sector))
    .reduce((highest, role) => Math.max(highest, Math.min(Number(role.authorityLevel || 0), cap)), 0);
  const hasOverall = access.authorityLevel !== undefined && access.authorityLevel !== null;
  return hasOverall ? Math.min(sectorLevel, overall) : sectorLevel;
}

export function hasSectorScope(access, sector) {
  if (!access) return false;
  const roles = access.roles || [];
  if (!roles.length) return !sector || !access.sectors?.length || access.sectors.includes("all") || access.sectors.includes(sector);
  return roles.some((role) => roleCoversSector(role, sector));
}

export function allowAllDecisionCapabilities() {
  return {
    source: "preview",
    decisions: Object.fromEntries(CASE_DECISION_KEYS.map((key) => [key, { allowed: true, requiresApproval: false, reason: null }])),
  };
}

// Client-side mirror of admin_apply_case_decision, used while the server
// capabilities RPC is unavailable.
export function fallbackDecisionCapabilities(access, item = {}) {
  const canManage = Boolean(access?.permissions?.includes("cases.manage")) && hasSectorScope(access, item?.sector);
  const authority = sectorAuthorityLevel(access, item?.sector);
  const superAdmin = isSuperAdmin(access);
  const accountDeletion = ACCOUNT_DELETION_RESOURCES.has(item?.resource_type);
  const decisions = Object.fromEntries(CASE_DECISION_KEYS.map((key) => {
    if (!canManage) return [key, { allowed: false, requiresApproval: false, reason: DECISION_REASONS.noManage }];
    if (AUTHORITY_3_DECISIONS.has(key) && authority < 3) return [key, { allowed: false, requiresApproval: false, reason: DECISION_REASONS.authority }];
    const needsApproval = !superAdmin && (APPROVAL_DECISIONS.has(key) || (accountDeletion && key === "approve"));
    return [key, { allowed: true, requiresApproval: needsApproval, reason: null }];
  }));
  return { source: "fallback", decisions };
}

// Accepts the RPC payload; any decision it does not describe keeps the
// fallback answer.
export function normalizeDecisionCapabilities(raw, fallback) {
  const base = fallback || { decisions: {} };
  const serverDecisions = raw && typeof raw === "object" && raw.decisions && typeof raw.decisions === "object" ? raw.decisions : null;
  if (!serverDecisions) return { ...base, source: base.source || "fallback" };
  const decisions = Object.fromEntries(CASE_DECISION_KEYS.map((key) => {
    const entry = serverDecisions[key];
    if (!entry || typeof entry !== "object") return [key, base.decisions?.[key] || { allowed: false, requiresApproval: false, reason: null }];
    return [key, { allowed: entry.allowed === true, requiresApproval: entry.requiresApproval === true, reason: entry.reason ? String(entry.reason) : null }];
  }));
  return { source: "server", decisions };
}

export function isMissingRpcError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "PGRST202" || code === "42883" || message.includes("could not find the function") || (message.includes("function") && message.includes("does not exist"));
}

// What the server actually did with a decision request.
// "approval" — parked for a second admin; "applied" — the case changed the
// way the decision implies; "unconfirmed" — nothing we can vouch for.
export function classifyDecisionResult(updated, decision) {
  if (!updated?.id) return "unconfirmed";
  if (updated.status === "approval_required") return "approval";
  if (decision === "request_information") return updated.status === "waiting_information" ? "applied" : "unconfirmed";
  if (CLOSED_CASE_STATUSES.includes(updated.status) && (!updated.resolution_code || updated.resolution_code === decision)) return "applied";
  return "unconfirmed";
}

// --- datetime-local <-> ISO ---------------------------------------------------

const pad = (value) => String(value).padStart(2, "0");

// ISO timestamp -> "YYYY-MM-DDTHH:mm" in the browser's local time zone.
export function isoToDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// datetime-local value (local wall time) -> ISO UTC string, or null. Values
// that already carry a zone (Z or ±hh:mm) are passed through normalised.
export function dateTimeLocalToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// --- Signed evidence links ----------------------------------------------------

export const SIGNED_URL_TTL_SECONDS = 60 * 60;
export const SIGNED_URL_REFRESH_MS = 50 * 60 * 1000;

export function isSignedUrlStale(entry, now = Date.now(), maxAgeMs = SIGNED_URL_REFRESH_MS) {
  if (!entry?.bucket || !entry?.path) return false;
  if (!entry.url) return true;
  return !entry.signedAt || now - Number(entry.signedAt) >= maxAgeMs;
}
