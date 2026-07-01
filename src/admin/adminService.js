import supabase from "../Backend/lib/supabaseClient";
import {
  previewAccess,
  previewAudit,
  previewCampaigns,
  previewCases,
  previewFlags,
  previewTeam,
  previewUsers,
  updatePreviewCase,
  updatePreviewFlag,
} from "./adminPreviewData";

const previewDelay = (value) => new Promise((resolve) => window.setTimeout(() => resolve(structuredClone(value)), 120));

export function isAdminPreview() {
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("preview") === "chief" || sessionStorage.getItem("kunthai-admin-preview") === "chief";
}

export function enableAdminPreview() {
  if (!import.meta.env.DEV) return;
  sessionStorage.setItem("kunthai-admin-preview", "chief");
  const url = new URL(window.location.href);
  url.searchParams.set("preview", "chief");
  window.history.replaceState({}, "", url);
}

function unwrap(result, fallbackMessage) {
  if (result.error) {
    const error = new Error(result.error.message || fallbackMessage);
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}

export async function getAdminAccess() {
  if (isAdminPreview()) return previewDelay(previewAccess);
  const data = unwrap(await supabase.rpc("get_my_admin_access"), "Unable to verify admin access.");
  return data || { isAdmin: false, permissions: [], roles: [], sectors: [] };
}

export async function getDashboardSummary() {
  if (isAdminPreview()) {
    const open = previewCases.filter((item) => !["resolved", "closed"].includes(item.status));
    return previewDelay({
      openCases: open.length,
      urgentCases: open.filter((item) => ["urgent", "critical"].includes(item.priority)).length,
      unassignedCases: open.filter((item) => !item.assignee_user_id).length,
      overdueCases: open.filter((item) => item.sla_due_at && new Date(item.sla_due_at) < new Date()).length,
      resolvedToday: 4,
      bySector: Object.fromEntries(["explore", "marketplace", "transport"].map((sector) => [sector, open.filter((item) => item.sector === sector).length])),
      byQueue: Object.fromEntries(["verification", "reports", "support", "finance"].map((queue) => [queue, open.filter((item) => item.queue === queue).length])),
    });
  }
  return unwrap(await supabase.rpc("admin_dashboard_summary"), "Unable to load the admin summary.");
}

export async function getAdminCases(filters = {}) {
  if (isAdminPreview()) {
    let rows = [...previewCases];
    if (filters.sector) rows = rows.filter((item) => item.sector === filters.sector);
    if (filters.queue) rows = rows.filter((item) => item.queue === filters.queue);
    if (filters.status === "open") rows = rows.filter((item) => !["resolved", "closed"].includes(item.status));
    if (filters.status && filters.status !== "open") rows = rows.filter((item) => item.status === filters.status);
    if (filters.assignee === "me") rows = rows.filter((item) => item.assignee_user_id === "preview-user");
    if (filters.search) {
      const search = filters.search.toLowerCase();
      rows = rows.filter((item) => `${item.case_number} ${item.title} ${item.description}`.toLowerCase().includes(search));
    }
    return previewDelay(rows);
  }

  let query = supabase.from("admin_cases").select("*").order("created_at", { ascending: false }).limit(filters.limit || 200);
  if (filters.sector) query = query.eq("sector", filters.sector);
  if (filters.queue) query = query.eq("queue", filters.queue);
  if (filters.status === "open") query = query.not("status", "in", "(resolved,closed)");
  else if (filters.status) query = query.eq("status", filters.status);
  if (filters.assignee === "me") {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) query = query.eq("assignee_user_id", data.user.id);
  }
  if (filters.search) query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  return unwrap(await query, "Unable to load admin cases.") || [];
}

export async function getCaseActivity(caseId) {
  if (isAdminPreview()) return previewDelay({ events: [], notes: [], approvals: [] });
  const [events, notes, approvals] = await Promise.all([
    supabase.from("admin_case_events").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
    supabase.from("admin_case_notes").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
    supabase.from("admin_approvals").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
  ]);
  return {
    events: unwrap(events, "Unable to load case events.") || [],
    notes: unwrap(notes, "Unable to load case notes.") || [],
    approvals: unwrap(approvals, "Unable to load case approvals.") || [],
  };
}

function collectCaseEvidence(value, path = [], collected = []) {
  if (!value) return collected;

  if (typeof value === "string") {
    if (/^(https?:|data:image\/)/i.test(value)) {
      collected.push({ label: path.join(" / ") || "Attachment", url: value });
    }
    return collected;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectCaseEvidence(item, [...path, String(index + 1)], collected));
    return collected;
  }

  if (typeof value !== "object") return collected;

  const bucket = value.bucket || value.storageBucket || "";
  const storagePath = value.path || value.storagePath || "";
  if (bucket && storagePath) {
    collected.push({
      label: value.fileName || value.name || path.join(" / ") || "Verification document",
      bucket,
      path: storagePath,
      contentType: value.contentType || "",
    });
  }

  Object.entries(value).forEach(([key, child]) => {
    if (["bucket", "storageBucket", "path", "storagePath"].includes(key)) return;
    collectCaseEvidence(child, [...path, key], collected);
  });
  return collected;
}

export async function getAdminCaseEvidence(item) {
  const references = collectCaseEvidence(item?.metadata?.source || {});
  const deduped = Array.from(new Map(references.map((entry) => [entry.url || `${entry.bucket}:${entry.path}`, entry])).values());

  return Promise.all(deduped.map(async (entry) => {
    if (entry.url) return entry;
    const { data, error } = await supabase.storage.from(entry.bucket).createSignedUrl(entry.path, 60 * 60);
    return {
      ...entry,
      url: error ? "" : data?.signedUrl || "",
      unavailable: error?.message || "",
    };
  }));
}

export async function claimCase(caseId) {
  if (isAdminPreview()) return previewDelay(updatePreviewCase(caseId, { assignee_user_id: "preview-user", status: "assigned" }));
  return unwrap(await supabase.rpc("admin_claim_case", { case_uuid: caseId }), "Unable to claim this case.");
}

export async function transitionCase(caseId, status, note = "") {
  if (isAdminPreview()) return previewDelay(updatePreviewCase(caseId, { status, resolution_note: note || null }));
  return unwrap(await supabase.rpc("admin_transition_case", { case_uuid: caseId, next_status: status, transition_note: note }), "Unable to update this case.");
}

export async function applyCaseDecision(caseId, decision, reason) {
  if (isAdminPreview()) return previewDelay(updatePreviewCase(caseId, { status: decision === "request_information" ? "waiting_information" : "resolved", resolution_code: decision, resolution_note: reason }));
  return unwrap(await supabase.rpc("admin_apply_case_decision", { case_uuid: caseId, decision_key: decision, decision_reason: reason }), "Unable to apply this decision.");
}

export async function reviewCaseApproval(approvalId, approved, reason, caseId = "") {
  if (isAdminPreview()) return previewDelay(updatePreviewCase(caseId, { status: approved ? "resolved" : "in_review" }));
  return unwrap(await supabase.rpc("admin_review_approval", { approval_uuid: approvalId, approve_action: approved, review_reason: reason }), "Unable to review this approval.");
}

export async function addCaseNote(caseId, body, visibility = "internal") {
  if (isAdminPreview()) return previewDelay({ id: crypto.randomUUID(), case_id: caseId, body, visibility, created_at: new Date().toISOString() });
  return unwrap(await supabase.rpc("admin_add_case_note", { case_uuid: caseId, note_body: body, note_visibility: visibility }), "Unable to add the note.");
}

export async function searchAdminUsers(search = "") {
  if (isAdminPreview()) {
    const value = search.toLowerCase();
    return previewDelay(previewUsers.filter((item) => !value || `${item.display_name} ${item.email} ${item.phone} ${item.username}`.toLowerCase().includes(value)));
  }
  return unwrap(await supabase.rpc("admin_search_users", { search_text: search, result_limit: 50 }), "Unable to search users.") || [];
}

export async function setAdminUserStatus(input) {
  if (isAdminPreview()) return previewDelay({ user_id: input.userId, status: input.status, reason: input.reason, restricted_sectors: input.sectors, expires_at: input.expiresAt || null });
  return unwrap(await supabase.rpc("admin_set_user_status", {
    target_user_id: input.userId,
    next_status: input.status,
    action_reason: input.reason,
    target_sectors: input.sectors,
    status_expires_at: input.expiresAt || null,
  }), "Unable to update the account status.");
}

export async function getAdminTeam() {
  if (isAdminPreview()) return previewDelay(previewTeam);
  return unwrap(await supabase.rpc("admin_list_team"), "Unable to load the admin team.") || [];
}

export async function grantAdminAccess(input) {
  if (isAdminPreview()) return previewDelay(input);
  return unwrap(await supabase.rpc("admin_grant_access", {
    target_email: input.email,
    target_role_key: input.roleKey,
    target_sectors: input.sectors,
    target_regions: input.regions,
    target_authority: input.authority,
    reason: input.reason,
  }), "Unable to grant admin access.");
}

export async function revokeAdminAccess(assignmentId, reason) {
  if (isAdminPreview()) return previewDelay({ id: assignmentId, status: "revoked" });
  return unwrap(await supabase.rpc("admin_revoke_access", { assignment_uuid: assignmentId, reason }), "Unable to revoke admin access.");
}

export async function getNotificationCampaigns() {
  if (isAdminPreview()) return previewDelay(previewCampaigns);
  return unwrap(await supabase.from("admin_notification_campaigns").select("*").order("created_at", { ascending: false }).limit(100), "Unable to load campaigns.") || [];
}

export async function createNotificationCampaign(input) {
  if (isAdminPreview()) return previewDelay({ id: crypto.randomUUID(), ...input, status: input.schedule ? "pending_approval" : "draft", created_at: new Date().toISOString(), delivery_count: 0, failure_count: 0 });
  return unwrap(await supabase.rpc("admin_create_campaign", {
    campaign_title: input.title,
    campaign_body: input.body,
    campaign_sector: input.sector,
    campaign_audience: input.audience,
    campaign_priority: input.priority,
    campaign_filter: input.filter || {},
    campaign_schedule: input.schedule || null,
  }), "Unable to create the campaign.");
}

export async function approveNotificationCampaign(campaignId) {
  if (isAdminPreview()) return previewDelay({ id: campaignId, status: "approved" });
  return unwrap(await supabase.rpc("admin_approve_campaign", { campaign_uuid: campaignId }), "Unable to approve the campaign.");
}

export async function publishNotificationCampaign(campaignId) {
  if (isAdminPreview()) return previewDelay({ id: campaignId, status: "completed", sent_at: new Date().toISOString(), delivery_count: 3842, failure_count: 0 });
  return unwrap(await supabase.rpc("admin_publish_campaign", { campaign_uuid: campaignId }), "Unable to publish the campaign.");
}

export async function getAuditLog() {
  if (isAdminPreview()) return previewDelay(previewAudit);
  return unwrap(await supabase.rpc("admin_get_audit_log", { result_limit: 250 }), "Unable to load audit history.") || [];
}

export async function getAdminActivityNotifications(limit = 20) {
  if (isAdminPreview()) {
    return previewDelay(previewAudit.slice(0, limit).map((item) => ({
      id: `preview-${item.id}`,
      notification_type: "admin_action",
      title: `Admin action: ${item.action_key}`,
      body: item.reason || item.resource_type || "Preview activity",
      priority: "normal",
      action_key: item.action_key,
      sector: item.sector,
      read_at: null,
      created_at: item.created_at,
      metadata: {},
    })));
  }
  return unwrap(
    await supabase
      .from("admin_activity_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100))),
    "Unable to load admin activity notifications.",
  ) || [];
}

export async function markAdminActivityNotificationsRead(ids = null) {
  if (isAdminPreview()) return previewDelay(0);
  return unwrap(
    await supabase.rpc("admin_mark_activity_notifications_read", {
      notification_ids: Array.isArray(ids) && ids.length ? ids : null,
    }),
    "Unable to mark admin notifications as read.",
  );
}

export function subscribeToAdminActivityNotifications(userId, onChange) {
  if (!userId || isAdminPreview()) return () => {};
  const channel = supabase
    .channel(`admin-activity-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "admin_activity_notifications", filter: `recipient_user_id=eq.${userId}` },
      (payload) => onChange?.(payload.new),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function getFeatureFlags() {
  if (isAdminPreview()) return previewDelay(previewFlags);
  return unwrap(await supabase.from("admin_feature_flags").select("*").order("sector").order("name"), "Unable to load feature controls.") || [];
}

export async function updateFeatureFlag(flagKey, enabled, reason) {
  if (isAdminPreview()) return previewDelay(updatePreviewFlag(flagKey, enabled));
  return unwrap(await supabase.rpc("admin_update_feature_flag", { target_flag_key: flagKey, next_enabled: enabled, next_configuration: null, change_reason: reason }), "Unable to update the feature flag.");
}
