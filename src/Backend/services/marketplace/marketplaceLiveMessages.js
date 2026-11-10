// A message from the other side of an UrMall chat, shown the moment the live
// feed delivers it: the thread adds it at once from the delivered row, and the
// quiet reload that follows only confirms it. Without this the message waited
// for the whole message list to be read again.

/** A delivered marketplace_customer_messages row in the thread's message shape. */
export function marketplaceMessageFromRow(row = {}) {
  return {
    id: row.id,
    from: row.sender_role || "buyer",
    text: row.preview || "",
    topic: row.topic || row.product_name || "",
    productName: row.product_name || "",
    mediaUrl: row.media_url || "",
    mediaType: row.media_type || "text",
    createdAt: row.created_at || new Date().toISOString(),
    sentBy: row.sent_by || "",
    replyToId: row.reply_to_id || "",
    replySnapshot: row.reply_snapshot || null,
    editedAt: row.edited_at || "",
    deletedAt: row.deleted_at || "",
  };
}

/**
 * The echoes list with a delivered row added for conversationId. My own
 * messages are already shown (sent from this screen), so only the other
 * side's are added, and each once.
 */
export function addDeliveredMessage(echoes = [], conversationId, row, myRole) {
  if (!conversationId || !row?.id) return echoes;
  if ((row.sender_role || "buyer") === myRole) return echoes;
  if (echoes.some((echo) => echo.message?.id === row.id)) return echoes;
  return [...echoes, { conversationId, message: marketplaceMessageFromRow(row) }];
}
