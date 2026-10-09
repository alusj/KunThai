// Mention notifications go through notify_explore_mentions, which honours the
// mentioned person's "Allow mentions" privacy setting and their "Mentions"
// notification setting. The client may only fall back to inserting the
// notification itself when that function does not exist at all (a database
// that never received the 2026-06-19 migration). When the function exists but
// failed, the fallback is skipped: inserting directly would bypass the
// mentioned person's choices.
export function shouldUseLegacyMentionInsert(rpcError) {
  if (!rpcError) return false;
  const message = String(rpcError.message || "").toLowerCase();
  if (rpcError.code === "PGRST202") return true;
  return message.includes("notify_explore_mentions")
    && (message.includes("could not find") || message.includes("schema cache") || message.includes("does not exist"));
}
