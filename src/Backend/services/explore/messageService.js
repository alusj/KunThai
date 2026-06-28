import supabase from "../../lib/supabaseClient";
import { uploadMediaDataUrl } from "./mediaService";

const CONVERSATIONS_KEY = "explore-message-conversations";
const MESSAGES_KEY = "explore-message-items";
const MESSAGE_ACTIVITY_KEY = "explore-message-activity";
const MESSAGE_TYPES = ["text", "image", "audio", "video", "location_request", "location_share", "system"];
export const EXPLORE_MESSAGE_EVENT = "explore-message-event";
export const EXPLORE_MESSAGE_ACTIVITY_EVENT = "explore-message-activity";
export const EXPLORE_MESSAGE_CACHE_CLEARED_EVENT = "explore-message-cache-cleared";
let realtimeSubscriptionSequence = 0;

function safeParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function scopedKey(key, userId = "") {
  return userId ? `${key}-${userId}` : key;
}

function readArray(key, userId = "") {
  try {
    const value = JSON.parse(localStorage.getItem(scopedKey(key, userId)) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeArray(key, value, userId = "") {
  localStorage.setItem(scopedKey(key, userId), JSON.stringify(value));
}

function getConversationTimestamp(conversation = {}) {
  return new Date(conversation.lastMessage?.createdAt || conversation.updatedAt || 0).getTime() || 0;
}

export function dedupeExploreConversations(conversations = []) {
  const byId = new Map();

  conversations.forEach((conversation) => {
    const id = String(conversation?.id || "").trim();
    if (!id) return;

    const incoming = { ...conversation, id };
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, incoming);
      return;
    }

    const incomingIsNewer = getConversationTimestamp(incoming) >= getConversationTimestamp(existing);
    const older = incomingIsNewer ? existing : incoming;
    const newer = incomingIsNewer ? incoming : existing;
    byId.set(id, {
      ...older,
      ...newer,
      participantIds: Array.from(new Set([...(older.participantIds || []), ...(newer.participantIds || [])].filter(Boolean))),
      participants: { ...(older.participants || {}), ...(newer.participants || {}) },
    });
  });

  return Array.from(byId.values()).sort((a, b) => getConversationTimestamp(b) - getConversationTimestamp(a));
}

function readConversations(userId = "") {
  return dedupeExploreConversations(readArray(CONVERSATIONS_KEY, userId));
}

function writeConversations(conversations, userId = "") {
  const next = dedupeExploreConversations(conversations);
  writeArray(CONVERSATIONS_KEY, next, userId);
  return next;
}

function replaceConversationForParticipantPair(conversations, incomingConversation) {
  const participantKey = [...(incomingConversation?.participantIds || [])].filter(Boolean).sort().join("__");
  const withoutReplacedPair = participantKey
    ? conversations.filter((conversation) => {
        if (conversation.id === incomingConversation.id) return false;
        return [...(conversation.participantIds || [])].filter(Boolean).sort().join("__") !== participantKey;
      })
    : conversations.filter((conversation) => conversation.id !== incomingConversation.id);

  return dedupeExploreConversations([incomingConversation, ...withoutReplacedPair]);
}

export function clearExploreMessageCache() {
  if (typeof localStorage !== "undefined") {
    const prefixes = [`${CONVERSATIONS_KEY}-`, `${MESSAGES_KEY}-`];
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    keys.forEach((key) => {
      if (key === CONVERSATIONS_KEY || key === MESSAGES_KEY || key === MESSAGE_ACTIVITY_KEY || prefixes.some((prefix) => key?.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    });
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EXPLORE_MESSAGE_CACHE_CLEARED_EVENT));
  }
}

function readObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeObject(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getConversationId(currentUserId, recipientId) {
  return [currentUserId || "me", recipientId || "unknown"].sort().join("__");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function getAuthenticatedUserId(profileUserId = "") {
  const { data, error } = await supabase.auth.getUser();
  const authenticatedUserId = data?.user?.id || "";

  if (error || !isUuid(authenticatedUserId)) {
    throw new Error("Please sign in again before opening messages.");
  }

  if (profileUserId && profileUserId !== authenticatedUserId) {
    throw new Error("Your account changed while opening this conversation. Please try again.");
  }

  return authenticatedUserId;
}

function isLocalConversationId(value) {
  return !isUuid(value);
}

function isMissingMessageStore(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes("does not exist") || message.includes("schema cache") || message.includes("infinite recursion");
}

function isMissingConversationRpc(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST202" || (
    message.includes("get_or_create_explore_direct_conversation")
    && (message.includes("schema cache") || message.includes("could not find"))
  );
}

function isMissingMessageRequestRpc(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST202" || (
    message.includes("respond_to_explore_message_request")
    && (message.includes("schema cache") || message.includes("could not find"))
  );
}

function isMissingColumn(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes(`'${columnName}' column`) || message.includes(`column "${columnName}"`) || message.includes(columnName) && message.includes("schema cache");
}

function normalizeConversation(row) {
  return {
    id: row.id,
    createdBy: row.created_by || row.createdBy || "",
    participantIds: row.participant_ids || row.participantIds || [],
    participants: row.participants || {},
    request: Boolean(row.request),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
  };
}

function normalizeMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id || row.conversationId,
    senderId: row.sender_id || row.senderId,
    body: row.body || "",
    type: row.type || row.media_type || "text",
    mediaUrl: row.media_url || row.mediaUrl || "",
    metadata: typeof row.metadata === "string" ? safeParse(row.metadata, {}) : row.metadata || {},
    read: Boolean(row.read),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  };
}

async function ensureExploreConversationMembers(conversationId, participantIds = []) {
  const rows = Array.from(new Set(participantIds.filter(isUuid))).map((userId) => ({
    conversation_id: conversationId,
    user_id: userId,
  }));
  if (!isUuid(conversationId) || !rows.length) return;

  const { error } = await supabase
    .from("explore_conversation_members")
    .upsert(rows, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });

  if (error && !isMissingMessageStore(error)) {
    throw error;
  }
}

function normalizeMessageInput(input) {
  if (typeof input === "string") {
    return { body: input.trim(), mediaUrl: "", type: "text" };
  }

  const body = String(input?.body || "").trim();
  const mediaUrl = String(input?.media_url || input?.mediaUrl || "").trim();
  const metadata = input?.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const requestedType = String(input?.type || input?.media_type || "").toLowerCase();
  const type = MESSAGE_TYPES.includes(requestedType)
    ? requestedType
    : mediaUrl
      ? "image"
      : "text";

  return {
    body,
    mediaUrl,
    metadata,
    type: mediaUrl || !["image", "audio", "video"].includes(type) ? type : "text",
  };
}

function getMessagePreview(message) {
  if (message.type === "location_request") return "Location request";
  if (message.type === "location_share") return "Location sharing";
  if (message.body) return message.body;
  if (message.type === "image") return "Photo";
  if (message.type === "audio") return "Voice note";
  if (message.type === "video") return "Video";
  return "Message";
}

function appendLocalMessage(userId, message) {
  if (!userId || !message?.conversationId) return;
  const messages = readArray(MESSAGES_KEY, userId);
  if (messages.some((item) => item.id === message.id)) return;
  writeArray(MESSAGES_KEY, [...messages, message], userId);
}

function removeLocalMessage(userId, messageId) {
  if (!userId || !messageId) return;
  writeArray(
    MESSAGES_KEY,
    readArray(MESSAGES_KEY, userId).filter((message) => message.id !== messageId),
    userId,
  );
}

function updateLocalConversationPreview(userId, conversationId, preview, updatedAt) {
  if (!userId || !conversationId) return [];
  const conversations = readConversations(userId).map((conversation) =>
    conversation.id === conversationId ? { ...conversation, preview, updatedAt } : conversation,
  );
  return writeConversations(conversations, userId);
}

function mirrorLocalMessageToParticipants(conversationId, senderId, message, preview) {
  const senderConversations = updateLocalConversationPreview(senderId, conversationId, preview, message.createdAt);
  const conversation = senderConversations.find((item) => item.id === conversationId);
  const participantIds = conversation?.participantIds || [];

  participantIds
    .filter((userId) => userId && userId !== senderId)
    .forEach((userId) => {
      appendLocalMessage(userId, message);
      const recipientConversations = readConversations(userId);
      const existing = recipientConversations.find((item) => item.id === conversationId);
      const nextConversation = {
        ...(existing || conversation),
        id: conversationId,
        preview,
        updatedAt: message.createdAt,
        participantIds,
        participants: existing?.participants || conversation?.participants || {},
      };
      writeConversations([
        nextConversation,
        ...recipientConversations.filter((item) => item.id !== conversationId),
      ], userId);
    });
}

async function fetchConversationMemberRows(conversationIds = []) {
  if (!conversationIds.length) return [];

  const { data, error } = await supabase
    .from("explore_conversation_members")
    .select("conversation_id, user_id")
    .in("conversation_id", conversationIds);

  if (error) {
    if (isMissingMessageStore(error)) return [];
    throw error;
  }

  return data || [];
}

async function fetchProfilesByIds(userIds = []) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("explore_profiles")
    .select("user_id, display_name, username, avatar_url")
    .in("user_id", ids);

  if (error) return {};

  return (data || []).reduce((profiles, profile) => {
    profiles[profile.user_id] = {
      userId: profile.user_id,
      displayName: profile.display_name || "Profile",
      username: profile.username || "user",
      avatarUrl: profile.avatar_url || "",
    };
    return profiles;
  }, {});
}

function hydrateConversations(conversations, members, profiles) {
  const membersByConversation = members.reduce((map, member) => {
    const list = map.get(member.conversation_id) || [];
    list.push(member.user_id);
    map.set(member.conversation_id, list);
    return map;
  }, new Map());

  return conversations.map((conversation) => {
    const participantIds = conversation.participantIds?.length
      ? conversation.participantIds
      : membersByConversation.get(conversation.id) || [];
    const uniqueParticipantIds = Array.from(new Set(participantIds.filter(Boolean)));

    return {
      ...conversation,
      participantIds: uniqueParticipantIds,
      participants: uniqueParticipantIds.reduce((items, userId) => {
        items[userId] = profiles[userId] || { userId, displayName: "Profile", username: "user", avatarUrl: "" };
        return items;
      }, conversation.participants || {}),
    };
  });
}

function fetchLocalConversations(currentUserId) {
  const conversations = readConversations(currentUserId);
  const messages = readArray(MESSAGES_KEY, currentUserId);

  return dedupeExploreConversations(conversations
    .filter((conversation) => conversation.participantIds?.includes(currentUserId))
    .map((conversation) => {
      const conversationMessages = messages.filter((message) => message.conversationId === conversation.id);
      const lastMessage = conversationMessages[conversationMessages.length - 1] || null;
      const unreadCount = conversationMessages.filter((message) => message.senderId !== currentUserId && !message.read).length;
      return { ...conversation, lastMessage, unreadCount };
    }));
}

export async function fetchExploreConversations(currentUserId) {
  if (!currentUserId) return [];

  const { data: memberRows, error: memberError } = await supabase
    .from("explore_conversation_members")
    .select("conversation_id, user_id")
    .eq("user_id", currentUserId);

  if (memberError) {
    if (isMissingMessageStore(memberError)) return fetchLocalConversations(currentUserId);
    throw memberError;
  }

  const conversationIds = Array.from(new Set((memberRows || []).map((item) => item.conversation_id).filter(Boolean)));
  if (!conversationIds.length) {
    writeConversations([], currentUserId);
    writeArray(MESSAGES_KEY, [], currentUserId);
    return [];
  }

  const { data, error } = await supabase
    .from("explore_conversations")
    .select("*")
    .in("id", conversationIds)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingMessageStore(error)) return fetchLocalConversations(currentUserId);
    throw error;
  }

  const conversations = dedupeExploreConversations((data || []).map(normalizeConversation));
  const fetchedConversationIds = conversations.map((conversation) => conversation.id);
  const allMembers = await fetchConversationMemberRows(fetchedConversationIds);
  const profiles = await fetchProfilesByIds(allMembers.map((member) => member.user_id));
  const hydratedConversations = dedupeExploreConversations(hydrateConversations(conversations, allMembers, profiles));
  const { data: messageRows, error: messageError } = fetchedConversationIds.length
    ? await supabase.from("explore_messages").select("*").in("conversation_id", fetchedConversationIds).order("created_at", { ascending: true })
    : { data: [], error: null };

  if (messageError) {
    if (isMissingMessageStore(messageError)) return fetchLocalConversations(currentUserId);
    throw messageError;
  }

  const messages = (messageRows || []).map(normalizeMessage);
  writeArray(MESSAGES_KEY, messages, currentUserId);

  const nextConversations = dedupeExploreConversations(hydratedConversations
    .map((conversation) => {
      const conversationMessages = messages.filter((message) => message.conversationId === conversation.id);
      const lastMessage = conversationMessages[conversationMessages.length - 1] || null;
      const unreadCount = conversationMessages.filter((message) => message.senderId !== currentUserId && !message.read).length;
      return { ...conversation, lastMessage, unreadCount };
    }));
  writeConversations(nextConversations, currentUserId);
  return nextConversations;
}

export async function fetchExploreMessages(conversationId, currentUserId = "") {
  if (!conversationId) return [];
  if (isLocalConversationId(conversationId)) {
    return readArray(MESSAGES_KEY, currentUserId).filter((message) => message.conversationId === conversationId);
  }

  const { data, error } = await supabase
    .from("explore_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingMessageStore(error)) return readArray(MESSAGES_KEY, currentUserId).filter((message) => message.conversationId === conversationId);
    throw error;
  }

  const nextMessages = (data || []).map(normalizeMessage);
  const otherMessages = readArray(MESSAGES_KEY, currentUserId).filter((message) => message.conversationId !== conversationId);
  writeArray(MESSAGES_KEY, [...otherMessages, ...nextMessages], currentUserId);
  return nextMessages;
}

export async function startExploreConversation(currentProfile, recipient) {
  const profileUserId = currentProfile?.userId || currentProfile?.id || "";
  const currentUserId = await getAuthenticatedUserId(profileUserId);
  const recipientId = recipient?.userId || recipient?.id || "";
  if (!isUuid(currentUserId) || !isUuid(recipientId)) {
    throw new Error("Unable to start this chat right now.");
  }
  if (currentUserId === recipientId) {
    throw new Error("You cannot message your own profile.");
  }

  const localConversationId = getConversationId(currentUserId, recipientId);
  const conversationKey = localConversationId;
  const conversations = readConversations(currentUserId);
  const existing = conversations.find(
    (conversation) => conversation.participantIds?.includes(currentUserId) && conversation.participantIds?.includes(recipientId),
  );

  if (existing && isUuid(existing.id)) {
    writeConversations(replaceConversationForParticipantPair(conversations, existing), currentUserId);
    return existing;
  }

  const { data: rpcConversation, error: rpcError } = await supabase
    .rpc("get_or_create_explore_direct_conversation", { recipient_user_id: recipientId })
    .maybeSingle();

  if (rpcError && !isMissingConversationRpc(rpcError)) {
    throw rpcError;
  }

  if (rpcConversation) {
    const normalized = hydrateConversations([normalizeConversation(rpcConversation)], [
      { conversation_id: rpcConversation.id, user_id: currentUserId },
      { conversation_id: rpcConversation.id, user_id: recipientId },
    ], {
      [currentUserId]: {
        userId: currentUserId,
        displayName: currentProfile?.displayName || currentProfile?.name || "You",
        username: currentProfile?.username || "you",
        avatarUrl: currentProfile?.avatarUrl || currentProfile?.avatar_url || "",
      },
      [recipientId]: {
        userId: recipientId,
        displayName: recipient?.displayName || recipient?.name || "Profile",
        username: recipient?.username || "user",
        avatarUrl: recipient?.avatarUrl || recipient?.avatar_url || "",
      },
    })[0];
    writeConversations(replaceConversationForParticipantPair(conversations, normalized), currentUserId);
    return normalized;
  }

  const { data: keyedConversation, error: keyedError } = await supabase
    .from("explore_conversations")
    .select("*")
    .eq("conversation_key", conversationKey)
    .maybeSingle();

  if (keyedError && !isMissingMessageStore(keyedError) && !isMissingColumn(keyedError, "conversation_key")) {
    throw keyedError;
  }

  if (keyedConversation) {
    await ensureExploreConversationMembers(keyedConversation.id, [currentUserId, recipientId]);
    const normalized = hydrateConversations([normalizeConversation(keyedConversation)], [
      { conversation_id: keyedConversation.id, user_id: currentUserId },
      { conversation_id: keyedConversation.id, user_id: recipientId },
    ], {
      [currentUserId]: {
        userId: currentUserId,
        displayName: currentProfile?.displayName || currentProfile?.name || "You",
        username: currentProfile?.username || "you",
        avatarUrl: currentProfile?.avatarUrl || currentProfile?.avatar_url || "",
      },
      [recipientId]: {
        userId: recipientId,
        displayName: recipient?.displayName || recipient?.name || "Profile",
        username: recipient?.username || "user",
        avatarUrl: recipient?.avatarUrl || recipient?.avatar_url || "",
      },
    })[0];
    writeConversations(replaceConversationForParticipantPair(conversations, normalized), currentUserId);
    return normalized;
  }

  const { data: currentMemberRows, error: currentMemberError } = await supabase
    .from("explore_conversation_members")
    .select("conversation_id")
    .eq("user_id", currentUserId);

  if (currentMemberError && !isMissingMessageStore(currentMemberError)) {
    throw currentMemberError;
  }

  const candidateIds = (currentMemberRows || []).map((item) => item.conversation_id).filter(Boolean);
  if (candidateIds.length) {
    const { data: recipientMemberRows, error: recipientMemberError } = await supabase
      .from("explore_conversation_members")
      .select("conversation_id")
      .eq("user_id", recipientId)
      .in("conversation_id", candidateIds);

    if (recipientMemberError && !isMissingMessageStore(recipientMemberError)) {
      throw recipientMemberError;
    }

    const existingId = recipientMemberRows?.[0]?.conversation_id;
    if (existingId) {
      const { data: remoteExisting, error: remoteError } = await supabase
        .from("explore_conversations")
        .select("*")
        .eq("id", existingId)
        .maybeSingle();

      if (remoteError && !isMissingMessageStore(remoteError)) {
        throw remoteError;
      }

      if (remoteExisting) {
        await ensureExploreConversationMembers(existingId, [currentUserId, recipientId]);
        const normalized = hydrateConversations([normalizeConversation(remoteExisting)], [
          { conversation_id: existingId, user_id: currentUserId },
          { conversation_id: existingId, user_id: recipientId },
        ], {
          [currentUserId]: {
            userId: currentUserId,
            displayName: currentProfile?.displayName || currentProfile?.name || "You",
            username: currentProfile?.username || "you",
            avatarUrl: currentProfile?.avatarUrl || currentProfile?.avatar_url || "",
          },
          [recipientId]: {
            userId: recipientId,
            displayName: recipient?.displayName || recipient?.name || "Profile",
            username: recipient?.username || "user",
            avatarUrl: recipient?.avatarUrl || recipient?.avatar_url || "",
          },
        })[0];
        writeConversations(replaceConversationForParticipantPair(conversations, normalized), currentUserId);
        return normalized;
      }
    }
  }

  const conversation = {
    id: localConversationId,
    createdBy: currentUserId,
    participantIds: [currentUserId, recipientId],
    participants: {
      [currentUserId]: {
        userId: currentUserId,
        displayName: currentProfile?.displayName || currentProfile?.name || "You",
        username: currentProfile?.username || "you",
        avatarUrl: currentProfile?.avatarUrl || currentProfile?.avatar_url || "",
      },
      [recipientId]: {
        userId: recipientId,
        displayName: recipient?.displayName || recipient?.name || "Profile",
        username: recipient?.username || "user",
        avatarUrl: recipient?.avatarUrl || recipient?.avatar_url || "",
      },
    },
    request: false,
    updatedAt: new Date().toISOString(),
  };

  const { data: createdConversation, error } = await insertExploreConversationDraft({
    created_by: currentUserId,
    participant_ids: [currentUserId, recipientId],
    conversation_key: conversationKey,
    request: conversation.request,
    updated_at: conversation.updatedAt,
  });

  if (error && !isMissingMessageStore(error)) {
    throw error;
  }

  if (!createdConversation) {
    writeConversations(replaceConversationForParticipantPair(conversations, conversation), currentUserId);
    return conversation;
  }

  const remoteConversation = { ...conversation, id: createdConversation.id };
  await ensureExploreConversationMembers(remoteConversation.id, [currentUserId, recipientId]);

  writeConversations(replaceConversationForParticipantPair(conversations, remoteConversation), currentUserId);
  return remoteConversation;
}

export async function respondToExploreMessageRequest(conversationId, accept = true) {
  if (!isUuid(conversationId)) {
    throw new Error("This message request is not available yet.");
  }

  const { data, error } = await supabase
    .rpc("respond_to_explore_message_request", {
      accept_request: Boolean(accept),
      conversation_uuid: conversationId,
    })
    .maybeSingle();

  if (error) {
    if (isMissingMessageRequestRpc(error)) {
      throw new Error("Message requests need the latest KunThai database update.");
    }
    throw error;
  }

  return data ? normalizeConversation(data) : null;
}

async function insertExploreConversationDraft(draft) {
  let payload = { ...draft };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from("explore_conversations")
      .insert(payload)
      .select()
      .maybeSingle();

    if (!error) {
      return { data, error: null };
    }

    const optionalColumn = ["participant_ids", "conversation_key", "created_by", "request"].find((column) => isMissingColumn(error, column));
    if (!optionalColumn) {
      return { data: null, error };
    }

    const { [optionalColumn]: _removed, ...nextPayload } = payload;
    payload = nextPayload;
  }

  return supabase.from("explore_conversations").insert(payload).select().maybeSingle();
}

export async function sendExploreMessage(conversationId, senderProfile, body, options = {}) {
  const draft = normalizeMessageInput(body);
  if (!conversationId || (!draft.body && !draft.mediaUrl)) return null;

  const profileUserId = senderProfile?.userId || senderProfile?.id || "";
  const senderId = await getAuthenticatedUserId(profileUserId);
  const isLocalConversation = isLocalConversationId(conversationId);
  const mediaUrl = !isLocalConversation && draft.mediaUrl
    ? await uploadMediaDataUrl(draft.mediaUrl, draft.type, senderId)
    : draft.mediaUrl;
  const message = {
    id: `message-${Date.now()}`,
    conversationId,
    senderId,
    body: draft.body,
    type: draft.type,
    mediaUrl,
    metadata: draft.metadata,
    read: false,
    createdAt: new Date().toISOString(),
  };
  const preview = getMessagePreview(message);

  appendLocalMessage(senderId, message);
  if (options.optimisticManaged) {
    updateLocalConversationPreview(senderId, conversationId, preview, message.createdAt);
  } else {
    mirrorLocalMessageToParticipants(conversationId, senderId, message, preview);
  }
  window.dispatchEvent(new CustomEvent(EXPLORE_MESSAGE_EVENT, { detail: { type: "message", conversationId, message } }));

  if (isLocalConversation) {
    return message;
  }

  const payload = {
    conversation_id: conversationId,
    sender_id: senderId,
    body: message.body,
    media_type: message.type,
    media_url: message.mediaUrl,
    metadata: message.metadata || {},
    read: message.read,
    created_at: message.createdAt,
  };

  let data = null;
  let error = null;
  let insertPayload = { ...payload };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await supabase.from("explore_messages").insert(insertPayload).select().single();
    data = result.data;
    error = result.error;
    if (!error) break;

    if (isMissingColumn(error, "metadata")) {
      const { metadata: _metadata, ...nextPayload } = insertPayload;
      insertPayload = nextPayload;
      continue;
    }

    if (isMissingColumn(error, "media_url")) {
      if (message.mediaUrl && !message.body) {
        throw new Error("Media messages need the latest Explore message schema.");
      }
      const { media_url: _mediaUrl, media_type: _mediaType, ...nextPayload } = insertPayload;
      insertPayload = { ...nextPayload, media_type: "text" };
      continue;
    }

    break;
  }

  if (error) {
    if (isMissingMessageStore(error)) return message;
    throw error;
  }

  await supabase.from("explore_conversations").update({ updated_at: message.createdAt }).eq("id", conversationId);
  const savedMessage = data ? normalizeMessage(data) : message;
  return savedMessage;
}

export async function markExploreConversationRead(conversationId, currentUserId) {
  const messages = readArray(MESSAGES_KEY, currentUserId).map((message) =>
    message.conversationId === conversationId && message.senderId !== currentUserId ? { ...message, read: true } : message,
  );
  writeArray(MESSAGES_KEY, messages, currentUserId);
  window.dispatchEvent(new CustomEvent(EXPLORE_MESSAGE_EVENT, { detail: { type: "read", conversationId, currentUserId } }));

  if (isLocalConversationId(conversationId)) {
    return;
  }

  const { error } = await supabase
    .from("explore_messages")
    .update({ read: true })
    .eq("conversation_id", conversationId)
    .neq("sender_id", currentUserId)
    .eq("read", false);

  if (error && !isMissingMessageStore(error)) {
    throw error;
  }
}

export async function deleteExploreMessage(message, currentUserId, options = {}) {
  const messageId = typeof message === "string" ? message : message?.id;
  const conversationId = message?.conversationId || message?.conversation_id || "";
  if (!messageId || !currentUserId) return;

  removeLocalMessage(currentUserId, messageId);
  window.dispatchEvent(new CustomEvent(EXPLORE_MESSAGE_EVENT, {
    detail: { type: "delete", conversationId, messageId },
  }));

  if (!options.forEveryone || !isUuid(messageId)) return;

  const { error } = await supabase
    .from("explore_messages")
    .delete()
    .eq("id", messageId)
    .eq("sender_id", currentUserId);

  if (error && !isMissingMessageStore(error)) {
    throw error;
  }
}

export function setExploreMessageActivity(conversationId, userId, activity = "active") {
  if (!conversationId || !userId) return;

  const activityMap = readObject(MESSAGE_ACTIVITY_KEY);
  const nextActivity = {
    conversationId,
    userId,
    activity,
    updatedAt: new Date().toISOString(),
  };

  activityMap[`${conversationId}:${userId}`] = nextActivity;
  writeObject(MESSAGE_ACTIVITY_KEY, activityMap);
  window.dispatchEvent(new CustomEvent(EXPLORE_MESSAGE_ACTIVITY_EVENT, { detail: nextActivity }));
}

export function fetchExploreMessageActivity() {
  return Object.values(readObject(MESSAGE_ACTIVITY_KEY));
}

export function subscribeToExploreMessages(currentUserId, onChange) {
  if (!isUuid(currentUserId)) return () => {};

  realtimeSubscriptionSequence += 1;

  const channel = supabase
    .channel(`explore-direct-messages-${currentUserId}-${realtimeSubscriptionSequence}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "explore_messages" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "explore_conversations" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "explore_conversation_members", filter: `user_id=eq.${currentUserId}` }, onChange)
    .subscribe();

  return () => supabase.removeChannel(channel);
}
