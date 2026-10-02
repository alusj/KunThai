// Client for the admin operations platform RPCs. Every call is authorised
// server-side (security-definer functions re-check permissions, authority,
// staff status and self-escalation); the console only hides what the server
// would refuse anyway.
import supabase from "../Backend/lib/supabaseClient";
import { ADMIN_ACTIVITY_REFRESH_EVENT, isAdminPreview } from "./adminService";
import { buildDirectoryArgs } from "./operationsConfig";

export { buildDirectoryArgs };

const nullable = (value) => (value === undefined || value === "" ? null : value);

const PREVIEW_MESSAGE = "This screen reads live data. Sign in with a real admin account to use it.";

function guardPreview() {
  if (isAdminPreview()) throw new Error(PREVIEW_MESSAGE);
}

function unwrap(result, fallbackMessage) {
  if (result.error) {
    const error = new Error(result.error.message || fallbackMessage);
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}

function announceChange(detail = {}) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ADMIN_ACTIVITY_REFRESH_EVENT, { detail }));
  }
}

// --- Directories ---------------------------------------------------------------

const LIST_RPC = {
  marketplace_business: "admin_list_marketplace_businesses",
  transport_operator: "admin_list_transport_operators",
  transport_company: "admin_list_transport_companies",
};

const DETAIL_RPC = {
  marketplace_business: ["admin_get_marketplace_business", "p_business_id"],
  transport_operator: ["admin_get_transport_operator", "p_operator_id"],
  transport_company: ["admin_get_transport_company", "p_company_id"],
};

export async function listDirectory(targetType, filters, paging) {
  guardPreview();
  const rows = unwrap(
    await supabase.rpc(LIST_RPC[targetType], buildDirectoryArgs(targetType, filters, paging)),
    "Unable to load this directory.",
  ) || [];
  return { rows, total: Number(rows[0]?.total_count || 0) };
}

export async function getDirectoryDetail(targetType, id) {
  guardPreview();
  const [fn, argument] = DETAIL_RPC[targetType];
  return unwrap(await supabase.rpc(fn, { [argument]: id }), "Unable to load this record.");
}

// --- Enforcement, notes, notices ------------------------------------------------

export async function applyEnforcement({ targetType, targetId, action, reasonCode, publicMessage, internalNote = "", capabilities = [], endsAt = null }) {
  guardPreview();
  const result = unwrap(await supabase.rpc("admin_apply_enforcement", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_action: action,
    p_reason_code: reasonCode,
    p_public_message: publicMessage,
    p_internal_note: internalNote,
    p_capabilities: capabilities,
    p_ends_at: endsAt,
  }), "Unable to apply this decision.");
  announceChange({ action: `enforcement.${action}`, targetType, targetId });
  return result;
}

export async function addInternalNote(targetType, targetId, body) {
  guardPreview();
  const result = unwrap(await supabase.rpc("admin_add_internal_note", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_body: body,
  }), "Unable to save the note.");
  announceChange({ action: "enforcement.note_added", targetType, targetId });
  return result;
}

export async function sendOwnerNotification({ targetType, targetId, title, body, actionTarget = null, priority = "normal" }) {
  guardPreview();
  const result = unwrap(await supabase.rpc("admin_send_owner_notification", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_title: title,
    p_body: body,
    p_action_target: actionTarget || null,
    p_priority: priority,
  }), "Unable to send the notice.");
  announceChange({ action: "notification.direct_sent", targetType, targetId });
  return result;
}

// --- Overview and audit -------------------------------------------------------------

export async function getPlatformOverview() {
  guardPreview();
  return unwrap(await supabase.rpc("admin_platform_overview"), "Unable to load platform metrics.");
}

export async function searchAuditLog(filters = {}, { page = 0, pageSize = 50 } = {}) {
  guardPreview();
  const rows = unwrap(await supabase.rpc("admin_search_audit_log", {
    p_search: nullable(String(filters.search || "").trim()),
    p_actor_user_id: nullable(filters.actor),
    p_action_prefix: nullable(filters.action),
    p_sector: nullable(filters.sector),
    p_resource_type: nullable(filters.resource),
    p_from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : null,
    p_to: filters.to ? new Date(new Date(`${filters.to}T00:00:00`).getTime() + 86400000).toISOString() : null,
    p_limit: pageSize,
    p_offset: Math.max(0, page) * pageSize,
  }), "Unable to load audit history.") || [];
  return { rows, total: Number(rows[0]?.total_count || 0) };
}

// --- Staff -----------------------------------------------------------------------------

export async function listStaff() {
  guardPreview();
  return unwrap(await supabase.rpc("admin_list_staff"), "Unable to load staff.") || [];
}

export async function getStaffActivity(userId, limit = 50) {
  guardPreview();
  return unwrap(await supabase.rpc("admin_get_staff_activity", { target_user_id: userId, result_limit: limit }), "Unable to load activity.") || [];
}

export async function updateStaffProfile({ userId, levelKey, department, jobTitle, managerUserId = null, reason }) {
  guardPreview();
  const result = unwrap(await supabase.rpc("admin_update_staff_profile", {
    target_user_id: userId,
    next_level_key: levelKey,
    next_department: department,
    next_job_title: jobTitle,
    next_manager_user_id: managerUserId || null,
    change_reason: reason,
  }), "Unable to update this staff member.");
  announceChange({ action: "team.staff_profile_updated", userId });
  return result;
}

export async function setStaffStatus({ userId, status, reason, until = null }) {
  guardPreview();
  const result = unwrap(await supabase.rpc("admin_set_staff_status", {
    target_user_id: userId,
    next_status: status,
    change_reason: reason,
    status_until_at: until,
  }), "Unable to change this staff member's status.");
  announceChange({ action: "team.staff_status_changed", userId });
  return result;
}

const PRESENCE_KEY = "kunthai-admin-presence-at";

// Marks the signed-in admin as active, at most every 5 minutes per tab.
export async function touchAdminPresence() {
  if (isAdminPreview()) return;
  try {
    const last = Number(sessionStorage.getItem(PRESENCE_KEY) || 0);
    if (Date.now() - last < 5 * 60 * 1000) return;
    sessionStorage.setItem(PRESENCE_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: still record presence.
  }
  try {
    await supabase.rpc("admin_touch_presence");
  } catch {
    // Presence is best-effort.
  }
}
