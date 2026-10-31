import supabase from "../Backend/lib/supabaseClient";
import { isAdminPreview } from "./adminService";

// Admin side of "Deleted accounts": who deleted a KunThai account, UrMall
// business, UrRide operator account, UrRide company or Explore Space, and why
// (20261031130000_account_deletion_reasons.sql). Read only, support.view.

const COLUMNS = "id, surface, target_id, target_name, user_id, account_name, username, email, reasons, note, created_at";

export const DELETION_SURFACE_LABELS = {
  kunthai_account: "KunThai account",
  urmall_business: "UrMall business",
  urride_operator: "UrRide operator",
  urride_company: "UrRide company",
  explore_space: "Space",
};

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

const previewRows = [
  { id: "preview-del-1", surface: "kunthai_account", target_id: null, target_name: "", user_id: "preview-u1", account_name: "Fatmata S.", username: "fatmata", email: "fatmata@example.com", reasons: ["notifications", "anotherAccount"], note: "I get too many alerts from Swip.", created_at: hoursAgo(3) },
  { id: "preview-del-2", surface: "urmall_business", target_id: "preview-biz", target_name: "Mariama's Kitchen", user_id: "preview-u2", account_name: "Mariama K.", username: "mariamak", email: "", reasons: ["notFound"], note: "", created_at: hoursAgo(30) },
  { id: "preview-del-3", surface: "urride_operator", target_id: null, target_name: "", user_id: "preview-u3", account_name: "Ibrahim T.", username: "", email: "ibrahim@example.com", reasons: [], note: "", created_at: hoursAgo(72) },
];

export async function getDeletedAccounts({ limit = 500 } = {}) {
  if (isAdminPreview()) return previewRows.map((row) => ({ ...row }));
  const { data, error } = await supabase
    .from("account_deletions")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message || "Unable to load deleted accounts.");
  return data || [];
}
