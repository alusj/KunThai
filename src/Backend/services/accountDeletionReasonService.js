import supabase from "../lib/supabaseClient";

// Why someone deletes an account: the reasons they ticked and what they wrote
// (both may be empty), kept for the admin console's "Deleted accounts" list
// (20261031130000_account_deletion_reasons.sql). Written just before the
// deletion and taken back if the deletion fails. Never blocks a deletion: if
// it cannot be saved, the account is still deleted.

// Translation keys under accountDeletion.reasons; stored as these keys.
export const DELETION_REASON_KEYS = ["notUsing", "anotherAccount", "privacy", "notifications", "hardToUse", "notFound"];

// English names for the admin console.
export const DELETION_REASON_LABELS = {
  notUsing: "I don't use it anymore",
  anotherAccount: "I have another account",
  privacy: "Privacy concerns",
  notifications: "Too many notifications",
  hardToUse: "It's hard to use",
  notFound: "I didn't find what I needed",
};

export const DELETION_SURFACES = ["kunthai_account", "urmall_business", "urride_operator", "urride_company", "explore_space"];

export const EMPTY_DELETION_REASON = Object.freeze({ reasons: [], note: "" });

export function cleanDeletionReason(reason = EMPTY_DELETION_REASON) {
  const reasons = Array.from(new Set((reason?.reasons || []).filter((key) => DELETION_REASON_KEYS.includes(key))));
  const note = String(reason?.note || "").trim().slice(0, 1000);
  return { reasons, note };
}

async function recordAccountDeletion({ surface, targetId = "", targetName = "", reason }) {
  const { reasons, note } = cleanDeletionReason(reason);
  try {
    const { data, error } = await supabase.rpc("record_account_deletion", {
      p_surface: surface,
      p_target_id: targetId ? String(targetId) : null,
      p_target_name: String(targetName || ""),
      p_reasons: reasons,
      p_note: note,
    });
    return error ? null : data || null;
  } catch {
    return null;
  }
}

// Records why, runs the deletion, and takes the record back if it fails.
export async function deleteWithReason({ surface, targetId, targetName, reason }, runDeletion) {
  const recordId = await recordAccountDeletion({ surface, targetId, targetName, reason });
  try {
    return await runDeletion();
  } catch (error) {
    if (recordId) {
      await Promise.resolve(supabase.rpc("withdraw_account_deletion", { p_id: recordId })).catch(() => {});
    }
    throw error;
  }
}
