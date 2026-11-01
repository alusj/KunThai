import supabase from "../../lib/supabaseClient";
import { invalidateCache } from "../../lib/queryCache";

// Reply, edit, delete for everyone and delete for me on UrMall chat messages
// (marketplace_customer_messages), shared by the buyer and seller screens.
// The database enforces who may do what and the time limits
// (20261101121000_urmall_message_actions.sql).

export const MESSAGE_ACTION_COLUMNS = "sent_by,reply_to_id,reply_snapshot,edited_at,deleted_at";

// True when the action columns are not in the database yet (migration not
// applied): reads then fall back to the older column list.
export function isMissingActionColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return ["sent_by", "reply_to_id", "reply_snapshot", "edited_at", "deleted_at"].some((column) => message.includes(column));
}

export function messageActionFields(row = {}) {
  return {
    sentBy: row.sent_by || "",
    replyToId: row.reply_to_id || "",
    replySnapshot: row.reply_snapshot || null,
    editedAt: row.edited_at || "",
    deletedAt: row.deleted_at || "",
  };
}

// The messages this account deleted for itself.
export async function fetchHiddenMarketplaceMessageIds() {
  const { data, error } = await supabase.from("marketplace_message_hidden").select("message_id").limit(2000);
  if (error) return new Set();
  return new Set((data || []).map((row) => row.message_id));
}

export async function hideMarketplaceMessage(messageId) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("Sign in to delete messages.");
  const { error } = await supabase
    .from("marketplace_message_hidden")
    .upsert({ user_id: userId, message_id: messageId }, { onConflict: "user_id,message_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  invalidateCache("buyer-messages");
}

export async function editMarketplaceMessage(messageId, body) {
  const { data, error } = await supabase.rpc("edit_marketplace_message", {
    p_message_id: messageId,
    p_body: String(body || "").trim(),
  });
  if (error) throw new Error(error.message);
  invalidateCache("buyer-messages");
  return data;
}

export async function deleteMarketplaceMessageForEveryone(messageId) {
  const { data, error } = await supabase.rpc("delete_marketplace_message_for_everyone", { p_message_id: messageId });
  if (error) throw new Error(error.message);
  invalidateCache("buyer-messages");
  return data;
}

export async function currentMarketplaceUserId() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id || "";
}
