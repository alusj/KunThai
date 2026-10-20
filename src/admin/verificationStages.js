// Where a verification case stands, for the verification queue and the case
// drawer. Pure rules with no imports, so they run under `node --test`.
//
// Stages (in queue order):
//   resubmitted      the applicant sent an update after an admin asked or decided
//   new              first submission, nobody has looked yet
//   in_review        an admin claimed it or is working on it
//   waiting_on_user  an admin asked for more documents; the applicant has not answered
//   approved / rejected / closed   decided

export const VERIFICATION_STAGES = Object.freeze({
  resubmitted: { label: "Resubmitted", detail: "New documents to review", tone: "violet" },
  new: { label: "New submission", detail: "First review", tone: "sky" },
  in_review: { label: "In review", detail: "An admin is on it", tone: "amber" },
  waiting_on_user: { label: "Waiting on applicant", detail: "More documents requested", tone: "zinc" },
  approved: { label: "Approved", detail: "Decided", tone: "emerald" },
  rejected: { label: "Rejected", detail: "Decided", tone: "red" },
  closed: { label: "Closed", detail: "Decided", tone: "zinc" },
});

export const VERIFICATION_LANES = Object.freeze([
  { key: "needs_review", label: "Needs review", stages: ["resubmitted", "new", "in_review"] },
  { key: "resubmitted", label: "Resubmitted", stages: ["resubmitted"] },
  { key: "new", label: "New submissions", stages: ["new"] },
  { key: "in_review", label: "In review", stages: ["in_review"] },
  { key: "waiting_on_user", label: "Waiting on applicant", stages: ["waiting_on_user"] },
  { key: "decided", label: "Decided", stages: ["approved", "rejected", "closed"] },
]);

const STAGE_ORDER = ["resubmitted", "new", "in_review", "waiting_on_user", "approved", "rejected", "closed"];
const APPROVE_CODES = new Set(["approve", "approve_recommend"]);
const IN_REVIEW_STATUSES = new Set(["triaged", "assigned", "in_review", "action_proposed", "approval_required", "actioned", "appeal_window"]);

function time(value) {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function verificationStage(item = {}) {
  const status = item.status || "new";
  if (status === "resolved" || status === "closed") {
    if (APPROVE_CODES.has(item.resolution_code)) return "approved";
    if (item.resolution_code === "reject") return "rejected";
    return "closed";
  }
  if (status === "waiting_information") return "waiting_on_user";
  if (status === "reopened") return "resubmitted";
  // Claimed after a resubmission and not decided yet: still the new material.
  const resubmitted = time(item.resubmitted_at);
  const reviewed = time(item.last_reviewed_at);
  if (resubmitted && (!reviewed || resubmitted > reviewed) && !item.assignee_user_id) return "resubmitted";
  if (IN_REVIEW_STATUSES.has(status) || item.assignee_user_id) return "in_review";
  return "new";
}

// Round 1 is the first submission; every resubmission adds one. Cases from
// before the review timeline existed count as first submissions.
export function reviewRound(item = {}) {
  const round = Number(item.review_round);
  return Number.isFinite(round) && round > 0 ? round : 1;
}

export function isContinuingCase(item = {}) {
  return reviewRound(item) > 1 || Boolean(item.info_requested_at || item.last_reviewed_at);
}

// The moment the case entered its current stage: what the wait is measured from.
export function stageSince(item = {}, stage = verificationStage(item)) {
  if (stage === "resubmitted") return item.resubmitted_at || item.updated_at || item.created_at || null;
  if (stage === "waiting_on_user") return item.info_requested_at || item.updated_at || item.created_at || null;
  if (stage === "in_review") return item.assigned_at || item.resubmitted_at || item.created_at || null;
  if (stage === "new") return item.created_at || null;
  return item.resolved_at || item.last_reviewed_at || item.updated_at || null;
}

export function waitingMs(item = {}, now = Date.now()) {
  const since = time(stageSince(item));
  return since ? Math.max(0, now - since) : 0;
}

// Over a day waiting for an admin is late; the applicant gets a week.
export function isWaitOverdue(item = {}, now = Date.now()) {
  const stage = verificationStage(item);
  if (["approved", "rejected", "closed"].includes(stage)) return false;
  const limit = stage === "waiting_on_user" ? 7 * 24 * 3600 * 1000 : 24 * 3600 * 1000;
  return waitingMs(item, now) > limit;
}

// Short wait label: "45 min", "5 h", "3 d".
export function formatWait(ms = 0) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

// Resubmitted first, then new, then in review (oldest wait first inside each),
// then cases waiting on the applicant, then decided ones (newest first).
export function sortVerificationQueue(cases = [], now = Date.now()) {
  return cases
    .map((item) => ({ item, stage: verificationStage(item), wait: waitingMs(item, now) }))
    .sort((a, b) => {
      const order = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
      if (order) return order;
      const decided = ["approved", "rejected", "closed"].includes(a.stage);
      return decided ? a.wait - b.wait : b.wait - a.wait;
    })
    .map((entry) => entry.item);
}

export function laneOf(stage) {
  return VERIFICATION_LANES.find((lane) => lane.key !== "needs_review" && lane.stages.includes(stage))?.key || "decided";
}

export function verificationLaneCounts(cases = []) {
  const counts = Object.fromEntries(VERIFICATION_LANES.map((lane) => [lane.key, 0]));
  cases.forEach((item) => {
    const stage = verificationStage(item);
    VERIFICATION_LANES.forEach((lane) => {
      if (lane.stages.includes(stage)) counts[lane.key] += 1;
    });
  });
  return counts;
}

// Cases an admin should act on now: the number on the Verification nav item.
export function verificationAttentionCount(cases = []) {
  return cases.filter((item) => item.queue === "verification" && ["resubmitted", "new"].includes(verificationStage(item))).length;
}

// --- What changed since the last review -------------------------------------

const IGNORED_FIELDS = new Set([
  "updated_at", "created_at", "reviewed_at", "reviewed_by", "last_seen_at", "last_location_at",
  "latitude", "longitude", "readiness_score", "wallet_balance", "pending_payout", "rating", "rating_count",
]);

function documentKey(entry = {}) {
  return String(entry.id || entry.storage_path || entry.file_url || entry.document_url || entry.file_name || "");
}

function documentLabel(entry = {}) {
  return String(entry.document_type || entry.file_name || "Document");
}

function documentStamp(entry = {}) {
  return JSON.stringify([entry.storage_path, entry.file_url, entry.document_url, entry.file_name, entry.uploaded_at]);
}

// Every document list in a case's source row: registration_documents arrays
// and object maps such as a company's {label: url} documents.
export function collectSourceDocuments(source = {}) {
  const documents = [];
  Object.entries(source || {}).forEach(([key, value]) => {
    if (!/documents$/i.test(key) || !value) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry && typeof entry === "object") documents.push(entry);
        else if (entry) documents.push({ id: `${key}:${entry}`, document_type: String(entry), file_url: String(entry) });
      });
    } else if (typeof value === "object") {
      Object.entries(value).forEach(([label, entry]) => {
        const url = typeof entry === "string" ? entry : entry?.url || entry?.path || JSON.stringify(entry);
        documents.push({ id: `${key}:${label}`, document_type: label, file_url: url });
      });
    }
  });
  return documents;
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Compares the record now with the snapshot kept when an admin last decided
// or asked for more. Returns null when there is no earlier review.
export function changesSinceLastReview(item = {}) {
  const snapshot = item.metadata?.reviewSnapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const before = snapshot.source && typeof snapshot.source === "object" ? snapshot.source : {};
  const now = item.metadata?.source && typeof item.metadata.source === "object" ? item.metadata.source : {};

  const beforeDocs = new Map(collectSourceDocuments(before).map((entry) => [documentKey(entry), entry]));
  const added = [];
  const replaced = [];
  collectSourceDocuments(now).forEach((entry) => {
    const key = documentKey(entry);
    const previous = beforeDocs.get(key);
    if (!previous) added.push(documentLabel(entry));
    else if (documentStamp(previous) !== documentStamp(entry)) replaced.push(documentLabel(entry));
  });

  const fields = [];
  new Set([...Object.keys(before), ...Object.keys(now)]).forEach((key) => {
    if (IGNORED_FIELDS.has(key) || /documents$/i.test(key)) return;
    const was = displayValue(before[key]);
    const is = displayValue(now[key]);
    if (was !== is && (typeof before[key] !== "object" || typeof now[key] !== "object" || was.length < 400)) {
      fields.push({ key, before: was, after: is });
    }
  });

  return {
    since: snapshot.at || item.last_reviewed_at || null,
    decision: snapshot.decision || "",
    addedDocuments: added,
    replacedDocuments: replaced,
    changedFields: fields,
    hasChanges: Boolean(added.length || replaced.length || fields.length),
  };
}

// --- Documents an admin can ask for ------------------------------------------

const OPERATOR_DOCUMENTS = [
  "National ID",
  "Driver or rider license",
  "Vehicle registration",
  "Insurance document",
  "Road worthiness or inspection certificate",
  "Operator selfie/photo",
  "Fleet photo - Front view",
  "Fleet photo - Back view",
  "Fleet photo - Left side",
  "Fleet photo - Right side",
];

export const REQUESTABLE_DOCUMENTS = Object.freeze({
  marketplace_business_registration: ["Owner/representative ID", "Business registration document", "Proof of business address", "Clearer photo of an uploaded document"],
  marketplace_verification: ["Owner/representative ID", "Business registration document", "Proof of business address"],
  marketplace_business_document: ["Owner/representative ID", "Business registration document", "Clearer photo of an uploaded document"],
  transport_operator_verification: [...OPERATOR_DOCUMENTS, "Clearer photo of an uploaded document"],
  transport_document_verification: [...OPERATOR_DOCUMENTS, "Clearer photo of an uploaded document"],
  transport_solo_fleet_verification: ["Vehicle registration", "Insurance document", "Road worthiness or inspection certificate", "Fleet photo - Front view", "Fleet photo - Back view"],
  transport_company_verification: ["Business registration", "Owner national ID", "Tax or business ID", "Transport permit", "Clearer photo of an uploaded document"],
  transport_fleet_verification: ["Vehicle registration", "Insurance document", "Road worthiness or inspection certificate", "Fleet image - Front view", "Fleet image - Back view", "Fleet image - Left side", "Fleet image - Right side"],
});

export function requestableDocuments(item = {}) {
  return REQUESTABLE_DOCUMENTS[item.resource_type] || ["Identity document", "Supporting document", "Clearer photo of an uploaded document"];
}
