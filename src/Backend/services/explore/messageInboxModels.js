// Pure helpers for Explore messages: private media references, block
// filtering, inbox rows from list_explore_conversations, thread paging and
// translated previews. No Supabase or DOM access, so they are unit-tested.

export const MESSAGE_MEDIA_BUCKET = "explore-message-media";
export const PRIVATE_MEDIA_PREFIX = `private:${MESSAGE_MEDIA_BUCKET}/`;
export const MESSAGE_PAGE_SIZE = 50;
// Signed URLs live for an hour and are renewed once less than 5 minutes remain.
export const SIGNED_MEDIA_TTL_SECONDS = 3600;
export const SIGNED_MEDIA_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidValue(value) {
  return UUID.test(String(value || ""));
}

// Private media is stored as "private:explore-message-media/<path>" so it can
// never be mistaken for the public URLs older messages carry.
export function isPrivateMediaRef(value) {
  return String(value || "").startsWith(PRIVATE_MEDIA_PREFIX);
}

export function privateMediaPath(value) {
  return isPrivateMediaRef(value) ? String(value).slice(PRIVATE_MEDIA_PREFIX.length) : "";
}

export function toPrivateMediaRef(path) {
  const clean = String(path || "").replace(/^\/+/, "");
  return clean ? `${PRIVATE_MEDIA_PREFIX}${clean}` : "";
}

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function mediaExtension(mimeType = "", type = "image") {
  const base = String(mimeType || "").split(";")[0].trim().toLowerCase();
  if (EXTENSIONS[base]) return EXTENSIONS[base];
  if (type === "audio") return "webm";
  if (type === "video") return "mp4";
  return "jpg";
}

// <conversation id>/<sender id>/<type>-<stamp>.<ext>: the storage policies read
// the first two folders, so the order matters.
export function buildMessageMediaPath({ conversationId, userId, type = "image", mimeType = "", stamp = "" }) {
  if (!isUuidValue(conversationId) || !isUuidValue(userId)) return "";
  const safeType = ["image", "audio", "video"].includes(type) ? type : "image";
  const safeStamp = String(stamp || "").replace(/[^a-z0-9-]/gi, "") || "file";
  return `${conversationId}/${userId}/${safeType}-${safeStamp}.${mediaExtension(mimeType, safeType)}`;
}

export function signedUrlIsFresh(entry, now = Date.now(), marginMs = SIGNED_MEDIA_REFRESH_MARGIN_MS) {
  return Boolean(entry?.url && Number(entry.expiresAt) - now > marginMs);
}

// Keys a block list may hold for the other side of a conversation: a person
// appears as "<id>" and "profile:<id>", a Space as "space:<id>".
export function conversationCounterpartKeys(conversation = {}, currentUserId = "") {
  const keys = [];
  if (conversation.spaceInbox) {
    const customerId = conversation.customerId || conversation.participantIds?.[0] || "";
    if (customerId) keys.push(customerId, `profile:${customerId}`);
    return keys;
  }
  if (conversation.spaceId) {
    keys.push(`space:${conversation.spaceId}`);
    return keys;
  }
  (conversation.participantIds || [])
    .filter((id) => id && id !== currentUserId)
    .forEach((id) => keys.push(id, `profile:${id}`));
  return keys;
}

export function isConversationBlocked(conversation, blocked, currentUserId = "") {
  if (!blocked || !blocked.size) return false;
  return conversationCounterpartKeys(conversation, currentUserId).some((key) => blocked.has(key));
}

export function filterBlockedConversations(conversations = [], blocked, currentUserId = "") {
  if (!blocked || !blocked.size) return conversations;
  return conversations.filter((conversation) => !isConversationBlocked(conversation, blocked, currentUserId));
}

export function filterBlockedMessages(messages = [], blocked, currentUserId = "") {
  if (!blocked || !blocked.size) return messages;
  return messages.filter((message) => (
    message.senderId === currentUserId
    || !(blocked.has(message.senderId) || blocked.has(`profile:${message.senderId}`))
  ));
}

export function isBlockedMessageError(error) {
  const hint = String(error?.hint || "");
  const message = String(error?.message || "").toLowerCase();
  return hint === "explore_blocked" || message.includes("can't message this account") || message.includes("can’t message this account");
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeMessageRow(row = {}) {
  return {
    id: row.id,
    conversationId: row.conversation_id || row.conversationId,
    senderId: row.sender_id || row.senderId,
    body: row.body || "",
    type: row.type || row.media_type || "text",
    mediaUrl: row.media_url || row.mediaUrl || "",
    metadata: parseMetadata(row.metadata),
    read: Boolean(row.read),
    createdAt: row.created_at || row.createdAt || new Date(0).toISOString(),
  };
}

// One row of list_explore_conversations as the conversation shape the inbox
// uses. Participants are hydrated separately (profiles and Spaces).
export function normalizeInboxRow(row = {}) {
  const participantIds = Array.isArray(row.participant_ids) && row.participant_ids.length
    ? row.participant_ids
    : Array.isArray(row.member_ids) ? row.member_ids : [];
  return {
    id: row.id,
    createdBy: row.created_by || "",
    participantIds: Array.from(new Set(participantIds.filter(Boolean))),
    memberIds: Array.isArray(row.member_ids) ? row.member_ids.filter(Boolean) : [],
    participants: {},
    request: Boolean(row.request),
    spaceId: row.space_id || "",
    updatedAt: row.updated_at || new Date(0).toISOString(),
    lastMessage: row.last_message ? normalizeMessageRow(row.last_message) : null,
    unreadCount: Math.max(0, Number(row.unread_count) || 0),
  };
}

// Older pages arrive newest first; the thread keeps oldest first with no
// duplicates.
export function mergeMessagePages(current = [], incoming = []) {
  const byId = new Map();
  [...incoming, ...current].forEach((message) => {
    if (!message?.id) return;
    byId.set(message.id, { ...(byId.get(message.id) || {}), ...message });
  });
  return Array.from(byId.values()).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

export function oldestMessageCursor(messages = []) {
  const persisted = messages.filter((message) => !message.pending && isUuidValue(message.id));
  if (!persisted.length) return "";
  return persisted.reduce((oldest, message) => (
    new Date(message.createdAt) < new Date(oldest.createdAt) ? message : oldest
  )).createdAt;
}

// The translation key (under exploreMessagesFix) and values for a message
// preview, or { text } when the message carries its own words.
export function messagePreviewParts(message) {
  if (!message) return { key: "" };
  const metadata = message.metadata || {};
  if (message.type === "location_request") return { key: "previewLocationRequest" };
  if (message.type === "location_share") return { key: "previewLocationShared" };
  if (message.body && !metadata.textKey) return { text: message.body };
  if (message.type === "image") return { key: "previewPhoto" };
  if (message.type === "audio") return { key: "previewVoiceNote" };
  if (message.type === "video") return { key: "previewVideo" };
  if (message.body) return { text: message.body };
  return { key: "previewMessage" };
}

// Location messages store a text key so each reader sees them in their own
// language; the English body stays as the fallback for older app versions.
export function locationMessageParts(message) {
  const metadata = message?.metadata || {};
  if (metadata.textKey === "locationRequest") {
    return { key: "locationRequestBody", vars: { name: metadata.requesterName || "" } };
  }
  if (metadata.textKey === "locationShare") {
    const label = metadata.address || metadata.name || "";
    return metadata.coordinatesLabel
      ? { key: "sharedLocationWithCoordinates", vars: { label, coordinates: metadata.coordinatesLabel } }
      : { key: "sharedLocationBody", vars: { label } };
  }
  return null;
}

export const PRESENCE_LABEL_KEYS = {
  typing: "presenceTyping",
  recording: "presenceRecording",
  online: "presenceOnline",
};
