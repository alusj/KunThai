// KAI — pure admin helpers.
//
// What the model may see from the admin workspace. Counts and trends are
// calculated here, deterministically. Case metadata passes through an
// allow-list so personal names, phone numbers, emails and user ids never
// reach the model, even though the administrator can see them on screen.

const OPEN_STATUSES_EXCLUDED = new Set(["resolved", "closed"]);

// Only these metadata fields describe a case without identifying a person.
const SAFE_METADATA_KEYS = [
  "reason",
  "report_count",
  "topic",
  "request_type",
  "case_type",
  "category",
  "city",
  "country",
  "country_iso",
  "business_name",
  "order_id",
  "trip_id",
];

function clip(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isOverdue(item, now) {
  return Boolean(item?.sla_due_at && new Date(item.sla_due_at).getTime() < now && !OPEN_STATUSES_EXCLUDED.has(item.status));
}

function ageHours(value, now) {
  const time = new Date(value || 0).getTime();
  return time ? Math.max(0, Math.round((now - time) / 36e5)) : null;
}

export function safeCaseMetadata(metadata) {
  const source = metadata?.source && typeof metadata.source === "object" ? metadata.source : {};
  const safe = {};
  for (const key of SAFE_METADATA_KEYS) {
    const value = source[key];
    if (value === null || value === undefined || value === "" || typeof value === "object") continue;
    safe[key] = clip(value, 120);
  }
  return safe;
}

/** One case with its activity, for summaries and drafts. */
export function caseFactsForAi(item, activity = {}, { now = Date.now() } = {}) {
  if (!item?.id) return null;
  return {
    caseNumber: item.case_number ?? undefined,
    title: clip(item.title, 160),
    description: clip(item.description, 600) || undefined,
    sector: item.sector,
    queue: item.queue,
    type: item.case_type || item.resource_type || undefined,
    status: item.status,
    priority: item.priority,
    assigned: Boolean(item.assignee_user_id),
    ageHours: ageHours(item.created_at, now),
    overdue: isOverdue(item, now),
    details: safeCaseMetadata(item.metadata),
    events: (activity.events || []).slice(0, 15).map((event) => ({
      type: event.event_type || event.type || undefined,
      summary: clip(event.summary || event.description || event.note, 200) || undefined,
      hoursAgo: ageHours(event.created_at, now),
    })),
    internalNotes: (activity.notes || []).slice(0, 10).map((note) => ({
      text: clip(note.body, 400),
      hoursAgo: ageHours(note.created_at, now),
    })),
    approvals: (activity.approvals || []).slice(0, 5).map((approval) => ({ status: approval.status, action: approval.action_key || approval.decision_key || undefined })),
  };
}

function countBy(list, pick) {
  return list.reduce((counts, item) => {
    const key = String(pick(item) || "unknown");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

/** Case patterns: deterministic counts plus a small, de-identified sample. */
export function casesOverviewFacts(cases, { status = "open", sector = "", queue = "", now = Date.now() } = {}) {
  let list = Array.isArray(cases) ? cases : [];
  if (status === "open") list = list.filter((item) => !OPEN_STATUSES_EXCLUDED.has(item.status));
  if (status === "resolved") list = list.filter((item) => OPEN_STATUSES_EXCLUDED.has(item.status));
  if (sector) list = list.filter((item) => item.sector === sector);
  if (queue) list = list.filter((item) => item.queue === queue);

  const lastDay = list.filter((item) => ageHours(item.created_at, now) !== null && ageHours(item.created_at, now) <= 24).length;
  const lastWeek = list.filter((item) => ageHours(item.created_at, now) !== null && ageHours(item.created_at, now) <= 24 * 7).length;

  return {
    filter: { status, sector: sector || "any", queue: queue || "any" },
    total: list.length,
    createdLast24Hours: lastDay,
    createdLast7Days: lastWeek,
    overdue: list.filter((item) => isOverdue(item, now)).length,
    unassigned: list.filter((item) => !item.assignee_user_id).length,
    bySector: countBy(list, (item) => item.sector),
    byQueue: countBy(list, (item) => item.queue),
    byStatus: countBy(list, (item) => item.status),
    byPriority: countBy(list, (item) => item.priority),
    byType: countBy(list, (item) => item.case_type || item.resource_type),
    byCountry: countBy(list, (item) => item.metadata?.source?.country_iso || item.metadata?.source?.country),
    recent: list.slice(0, 15).map((item) => ({
      caseNumber: item.case_number ?? undefined,
      title: clip(item.title, 120),
      description: clip(item.description, 180) || undefined,
      sector: item.sector,
      queue: item.queue,
      priority: item.priority,
      status: item.status,
      overdue: isOverdue(item, now),
      reason: safeCaseMetadata(item.metadata).reason,
    })),
  };
}

export function platformSummaryFacts(summary) {
  if (!summary || typeof summary !== "object") return { error: "The admin summary is not available right now." };
  return {
    openCases: summary.openCases ?? summary.open_cases ?? null,
    urgentCases: summary.urgentCases ?? summary.urgent_cases ?? null,
    unassignedCases: summary.unassignedCases ?? summary.unassigned_cases ?? null,
    overdueCases: summary.overdueCases ?? summary.overdue_cases ?? null,
    resolvedToday: summary.resolvedToday ?? summary.resolved_today ?? null,
    openBySector: summary.bySector ?? summary.by_sector ?? undefined,
    openByQueue: summary.byQueue ?? summary.by_queue ?? undefined,
  };
}

export function campaignsFacts(campaigns) {
  const list = Array.isArray(campaigns) ? campaigns : [];
  return {
    total: list.length,
    byStatus: countBy(list, (item) => item.status),
    recent: list.slice(0, 10).map((item) => ({
      name: clip(item.campaign_name || item.title, 100),
      title: clip(item.title, 100),
      category: item.category || item.sector || undefined,
      status: item.status,
      delivered: item.delivery_count ?? undefined,
      failed: item.failure_count ?? undefined,
    })),
  };
}

/** Audit history without administrator identities. */
export function auditFacts(audit, { now = Date.now() } = {}) {
  const list = (Array.isArray(audit) ? audit : []).slice(0, 60);
  return {
    actions: list.length,
    byAction: countBy(list, (item) => item.action_key),
    bySector: countBy(list, (item) => item.sector),
    recent: list.slice(0, 20).map((item) => ({
      action: item.action_key,
      sector: item.sector || undefined,
      resource: item.resource_type || undefined,
      reason: clip(item.reason, 160) || undefined,
      hoursAgo: ageHours(item.created_at, now),
    })),
  };
}
