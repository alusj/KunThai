import supabase from "../Backend/lib/supabaseClient";
import { isAdminPreview, resignEvidenceUrl } from "./adminService";

// Admin side of Your Voice. Reads go through row level security (support.view
// on Explore); status and reply changes need support.manage. Each change also
// refreshes the matching Support case through the existing intake trigger.

const TABLE = "user_care_feedback";
const VOICE_BUCKET = "user-care-voice-notes";
const SCREENSHOT_BUCKET = "user-care-screenshots";
const COLUMNS = "id, user_id, feedback_type, category, title, message, voice_note_url, screenshot_url, current_screen, status, admin_reply, admin_seen, created_at, updated_at";

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

let previewRows = [
  { id: "preview-voice-1", user_id: "preview-u1", feedback_type: "safety", category: "transport", title: "Driver went off route", message: "My UrRide driver took a road I did not know and would not stop.", voice_note_url: "user-care/preview-u1/voice.webm", screenshot_url: "user-care/preview-u1/shot.png", current_screen: "UrRide trip", status: "submitted", admin_reply: null, admin_seen: false, created_at: hoursAgo(2), updated_at: hoursAgo(2), display_name: "Aminata K.", username: "aminata" },
  { id: "preview-voice-2", user_id: "preview-u2", feedback_type: "idea", category: "explore", title: "Save Swip videos to watch later", message: "A watch-later list would help.", voice_note_url: null, screenshot_url: null, current_screen: "Swip", status: "under_review", admin_reply: null, admin_seen: true, created_at: hoursAgo(26), updated_at: hoursAgo(20), display_name: "Musa B.", username: "musab" },
  { id: "preview-voice-3", user_id: "preview-u3", feedback_type: "bug", category: "marketplace", title: "Cart emptied after sign-in", message: "", voice_note_url: null, screenshot_url: "user-care/preview-u3/shot.png", current_screen: "UrMall cart", status: "fixed", admin_reply: "Thanks, this is fixed in the latest update.", admin_seen: true, created_at: hoursAgo(80), updated_at: hoursAgo(30), display_name: "", username: "" },
];

function unwrap(result, fallbackMessage) {
  if (result.error) {
    const error = new Error(result.error.message || fallbackMessage);
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}

export async function getYourVoiceFeedback({ limit = 400 } = {}) {
  if (isAdminPreview()) return previewRows.map((row) => ({ ...row }));

  const rows = unwrap(
    await supabase.from(TABLE).select(COLUMNS).order("created_at", { ascending: false }).limit(limit),
    "Unable to load Your Voice feedback.",
  ) || [];

  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
  if (!userIds.length) return rows;
  const { data: profiles } = await supabase.from("explore_profiles").select("user_id, display_name, username").in("user_id", userIds);
  const byUser = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
  return rows.map((row) => ({
    ...row,
    display_name: byUser.get(row.user_id)?.display_name || "",
    username: byUser.get(row.user_id)?.username || "",
  }));
}

// Signed links for the screenshot and voice note, shown inline in the panel.
export async function getYourVoiceAttachments(row) {
  const entries = [
    row?.screenshot_url ? { bucket: SCREENSHOT_BUCKET, path: row.screenshot_url, kind: "image", label: "Screenshot" } : null,
    row?.voice_note_url ? { bucket: VOICE_BUCKET, path: row.voice_note_url, kind: "audio", label: "Voice note" } : null,
  ].filter(Boolean);
  return Promise.all(entries.map((entry) => resignEvidenceUrl(entry)));
}

// changes: { status?, admin_reply?, admin_seen? }
export async function updateYourVoiceFeedback(id, changes) {
  const payload = {};
  if (changes.status) payload.status = changes.status;
  if (changes.admin_reply !== undefined) payload.admin_reply = String(changes.admin_reply || "").trim() || null;
  if (changes.admin_seen !== undefined) payload.admin_seen = Boolean(changes.admin_seen);

  if (isAdminPreview()) {
    previewRows = previewRows.map((row) => (row.id === id ? { ...row, ...payload, updated_at: new Date().toISOString() } : row));
    return previewRows.find((row) => row.id === id);
  }

  return unwrap(
    await supabase.from(TABLE).update(payload).eq("id", id).select(COLUMNS).single(),
    "Unable to save this feedback.",
  );
}
