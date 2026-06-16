import supabase from "../../lib/supabaseClient";
import { uploadMediaDataUrl } from "./mediaService";

const CONVERSATIONS_KEY = "explore-message-conversations";
const MESSAGES_KEY = "explore-message-items";
const MESSAGE_ACTIVITY_KEY = "explore-message-activity";
const MESSAGE_TYPES = ["text", "image", "audio", "video", "location_request", "location_share", "system"];
export const EXPLORE_MESSAGE_EVENT = "explore-message-event";
export const EXPLORE_MESSAGE_ACTIVITY_EVENT = "explore-message-activity";

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

function isLocalConversationId(value) {
  return !isUuid(value);
}

function isMissingMessageStore(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes("does not exist") || message.includes("schema cache") || message.includes("infinite recursion");
}

function isMissingColumn(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes(`'${columnName}' column`) || message.includes(`column "${columnName}"`) || message.includes(columnName) && message.includes("schema cache");
}

function normalizeConversation(row) {
  return {
    id: row.id,
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

function updateLocalConversationPreview(userId, conversationId, preview, updatedAt) {
  if (!userId || !conversationId) return [];
  const conversations = readArray(CONVERSATIONS_KEY, userId).map((conversation) =>
    conversation.id === conversationId ? { ...conversation, preview, updatedAt } : conversation,
  );
  writeArray(CONVERSATIONS_KEY, conversations, userId);
  return conversations;
}

function mirrorLocalMessageToParticipants(conversationId, senderId, message, preview) {
  const senderConversations = updateLocalConversationPreview(senderId, conversationId, preview, message.createdAt);
  const conversation = senderConversations.find((item) => item.id === conversationId);
  const participantIds = conversation?.participantIds || [];

  participantIds
    .filter((userId) => userId && userId !== senderId)
    .forEach((userId) => {
      appendLocalMessage(userId, message);
      const recipientConversations = readArray(CONVERSATIONS_KEY, userId);
      const existing = recipientConversations.find((item) => item.id === conversationId);
      const nextConversation = {
        ...(existing || conversation),
        id: conversationId,
        preview,
        updatedAt: message.createdAt,
        participantIds,
        participants: existing?.participants || conversation?.participants || {},
      };
      writeArray(CONVERSATIONS_KEY, [
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

    return {
      ...conversation,
      participantIds,
      participants: participantIds.reduce((items, userId) => {
        items[userId] = profiles[userId] || { userId, displayName: "Profile", username: "user", avatarUrl: "" };
        return items;
      }, conversation.participants || {}),
    };
  });
}

function fetchLocalConversations(currentUserId) {
  const conversations = readArray(CONVERSATIONS_KEY, currentUserId);
  const messages = readArray(MESSAGES_KEY, currentUserId);

  return conversations
    .filter((conversation) => conversation.participantIds?.includes(currentUserId))
    .map((conversation) => {
      const conversationMessages = messages.filter((message) => message.conversationId === conversation.id);
      const lastMessage = conversationMessages[conversationMessages.length - 1] || null;
      const unreadCount = conversationMessages.filter((message) => message.senderId !== currentUserId && !message.read).length;
      return { ...conversation, lastMessage, unreadCount };
    })
    .sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt || 0) - new Date(a.lastMessage?.createdAt || a.updatedAt || 0));
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

  const conversationIds = (memberRows || []).map((item) => item.conversation_id).filter(Boolean);
  if (!conversationIds.length) return [];

  const { data, error } = await supabase
    .from("explore_conversations")
    .select("*")
    .in("id", conversationIds)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingMessageStore(error)) return fetchLocalConversations(currentUserId);
    throw error;
  }

  const conversations = (data || []).map(normalizeConversation);
  const fetchedConversationIds = conversations.map((conversation) => conversation.id);
  const allMembers = await fetchConversationMemberRows(fetchedConversationIds);
  const profiles = await fetchProfilesByIds(allMembers.map((member) => member.user_id));
  const hydratedConversations = hydrateConversations(conversations, allMembers, profiles);
  const { data: messageRows, error: messageError } = fetchedConversationIds.length
    ? await supabase.from("explore_messages").select("*").in("conversation_id", fetchedConversationIds).order("created_at", { ascending: true })
    : { data: [], error: null };

  if (messageError) {
    if (isMissingMessageStore(messageError)) return fetchLocalConversations(currentUserId);
    throw messageError;
  }

  const messages = (messageRows || []).map(normalizeMessage);
  writeArray(CONVERSATIONS_KEY, hydratedConversations, currentUserId);
  writeArray(MESSAGES_KEY, messages, currentUserId);

  return hydratedConversations
    .map((conversation) => {
      const conversationMessages = messages.filter((message) => message.conversationId === conversation.id);
      const lastMessage = conversationMessages[conversationMessages.length - 1] || null;
      const unreadCount = conversationMessages.filter((message) => message.senderId !== currentUserId && !message.read).length;
      return { ...conversation, lastMessage, unreadCount };
    })
    .sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt || 0) - new Date(a.lastMessage?.createdAt || a.updatedAt || 0));
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
  const currentUserId = currentProfile?.userId || currentProfile?.id || "";
  const recipientId = recipient?.userId || recipient?.id || "";
  if (!isUuid(currentUserId) || !isUuid(recipientId)) {
    throw new Error("Unable to start this chat right now.");
  }

  const localConversationId = getConversationId(currentUserId, recipientId);
  const conversationKey = localConversationId;
  const conversations = readArray(CONVERSATIONS_KEY, currentUserId);
  const existing = conversations.find(
    (conversation) => conversation.participantIds?.includes(currentUserId) && conversation.participantIds?.includes(recipientId),
  );

  if (existing && isUuid(existing.id)) {
    return existing;
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
    writeArray(CONVERSATIONS_KEY, [normalized, ...conversations.filter((item) => item.id !== normalized.id)], currentUserId);
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
        writeArray(CONVERSATIONS_KEY, [normalized, ...conversations.filter((item) => item.id !== normalized.id)], currentUserId);
        return normalized;
      }
    }
  }

  const conversation = {
    id: localConversationId,
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
    writeArray(CONVERSATIONS_KEY, [conversation, ...conversations], currentUserId);
    return conversation;
  }

  const remoteConversation = { ...conversation, id: createdConversation.id };
  await ensureExploreConversationMembers(remoteConversation.id, [currentUserId, recipientId]);

  writeArray(CONVERSATIONS_KEY, [remoteConversation, ...conversations], currentUserId);
  return remoteConversation;
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

  const senderId = senderProfile?.userId || senderProfile?.id || "me";
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
  mirrorLocalMessageToParticipants(conversationId, senderId, message, preview);
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

export function subscribeToExploreMessages(currentUserId, onChange, conversationIds = []) {
  if (!currentUserId) return () => {};

  const channel = supabase
    .channel(`explore-direct-messages-${currentUserId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "explore_messages" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "explore_conversations" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "explore_conversation_members", filter: `user_id=eq.${currentUserId}` }, onChange)
    .subscribe();

  return () => supabase.removeChannel(channel);
}
