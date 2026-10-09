import supabase from "../../lib/supabaseClient";
import { dataUrlToBlob, uploadMediaDataUrl } from "./mediaService";
import {
  buildMessageMediaPath,
  MESSAGE_MEDIA_BUCKET,
  MESSAGE_PAGE_SIZE,
  normalizeInboxRow,
  privateMediaPath,
  isPrivateMediaRef,
  SIGNED_MEDIA_TTL_SECONDS,
  signedUrlIsFresh,
  toPrivateMediaRef,
} from "./messageInboxModels.js";
import { SPACE_IDENTITY_TYPE } from "./identityService";
import { normalizeSpaceResponsibilities } from "./spaceService";

const CONVERSATIONS_KEY = "explore-message-conversations";
const MESSAGES_KEY = "explore-message-items";
const MESSAGE_ACTIVITY_KEY = "explore-message-activity";
const MESSAGE_TYPES = ["text", "image", "audio", "video", "location_request", "location_share", "system"];
export const EXPLORE_MESSAGE_EVENT = "explore-message-event";
export const EXPLORE_MESSAGE_ACTIVITY_EVENT = "explore-message-activity";
export const EXPLORE_MESSAGE_CACHE_CLEARED_EVENT = "explore-message-cache-cleared";
export const EXPLORE_OPEN_CONVERSATION_EVENT = "kuntai-open-conversation";
let realtimeSubscriptionSequence = 0;

// A banner tap can request a conversation before the Messages screen (or even
// Explore) is mounted; the id waits here until useExploreMessages consumes it.
let pendingOpenConversationId = "";

export function requestConversationOpen(conversationId) {
  pendingOpenConversationId = String(conversationId || "");
  if (!pendingOpenConversationId) return;
  window.dispatchEvent(new CustomEvent(EXPLORE_OPEN_CONVERSATION_EVENT, { detail: { conversationId: pendingOpenConversationId } }));
}

export function peekPendingConversationOpen() {
  return pendingOpenConversationId;
}

export function clearPendingConversationOpen() {
  pendingOpenConversationId = "";
}

// A push/banner for a Space inbox thread names only the conversation. When it
// is not in the personal inbox, find which Space owns it so Explore can switch
// to that Space and open its inbox (the pending id is then picked up there).
export const EXPLORE_OPEN_SPACE_INBOX_EVENT = "explore-open-space-inbox";

export async function findConversationSpaceId(conversationId) {
  if (!isUuid(conversationId)) return "";
  const { data, error } = await supabase
    .from("explore_conversations")
    .select("id, space_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !data) return "";
  return data.space_id || "";
}

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

function isMissingRpc(error, rpcName) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST202" || error?.code === "42883" || (
    message.includes(rpcName)
    && (message.includes("schema cache") || message.includes("could not find") || message.includes("does not exist"))
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
    // Set when the thread belongs to a Space (the Space inbox) instead of two
    // people.
    spaceId: row.space_id || row.spaceId || "",
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

async function getMessageActorMetadata(senderProfile, senderId) {
  if (senderProfile?.identityType !== SPACE_IDENTITY_TYPE && !senderProfile?.spaceId) {
    return {};
  }

  const spaceId = senderProfile.spaceId || senderProfile.identityId || "";
  if (!spaceId) return {};

  const { data: membership, error } = await supabase
    .from("explore_space_members")
    .select("role, status, responsibilities")
    .eq("space_id", spaceId)
    .eq("user_id", senderId)
    .maybeSingle();

  if (error && !isMissingMessageStore(error)) {
    throw error;
  }

  const responsibilities = normalizeSpaceResponsibilities(membership?.responsibilities || {}, membership?.role || "member");
  if (membership?.status !== "active" || !responsibilities.canReplyMessages) {
    throw new Error("You need a Space team responsibility that can reply to messages.");
  }

  return {
    actorType: SPACE_IDENTITY_TYPE,
    actorId: spaceId,
    spaceId,
    actorName: senderProfile.displayName || senderProfile.name || "Space",
    actorAvatarUrl: senderProfile.avatarUrl || senderProfile.avatar_url || "",
    actorRole: membership.role || "member",
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

async function fetchSpacesByIds(spaceIds = []) {
  const ids = Array.from(new Set(spaceIds.filter(isUuid)));
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("explore_spaces")
    .select("id, owner_user_id, name, slug, avatar_url, verified, category")
    .in("id", ids);

  if (error) return {};
  return (data || []).reduce((spaces, space) => {
    spaces[space.id] = space;
    return spaces;
  }, {});
}

// The Space as the other side of a thread: what a customer sees in their inbox
// and conversation header. userId stays empty — a Space has no single person
// behind it, so presence and blocking never target the owner by accident.
export function spaceCounterpart(space = {}, spaceId = "") {
  const id = space.id || space.spaceId || spaceId;
  return {
    userId: "",
    spaceId: id,
    identityType: "space",
    identityId: id,
    actorType: "space",
    actorId: id,
    ownerUserId: space.owner_user_id || space.ownerUserId || "",
    displayName: space.name || space.displayName || "Space",
    username: space.slug || space.username || "",
    avatarUrl: space.avatar_url || space.avatarUrl || "",
    verified: Boolean(space.verified),
    accountType: "space",
  };
}

function attachSpaceCounterparts(conversations, spacesById) {
  return conversations.map((conversation) => (
    conversation.spaceId
      ? { ...conversation, counterpart: spaceCounterpart(spacesById[conversation.spaceId], conversation.spaceId) }
      : conversation
  ));
}

export function spaceInboxCacheKey(currentUserId = "", spaceId = "") {
  return currentUserId && spaceId ? `${currentUserId}-space-${spaceId}` : currentUserId;
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
      return {
        ...conversation,
        lastMessage: newestMessage(conversationMessages[conversationMessages.length - 1], conversation.lastMessage),
        unreadCount: Number.isFinite(conversation.unreadCount)
          ? conversation.unreadCount
          : conversationMessages.filter((message) => message.senderId !== currentUserId && !message.read).length,
      };
    }));
}

function newestMessage(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a.createdAt || 0) >= new Date(b.createdAt || 0) ? a : b;
}

// The inbox in one query (list_explore_conversations): each conversation with
// its last visible message and unread count. null before the RPC exists.
async function fetchInboxRows(spaceId = "") {
  const { data, error } = await supabase.rpc("list_explore_conversations", {
    p_space_id: spaceId || null,
    p_limit: 200,
  });
  if (error) {
    if (isMissingRpc(error, "list_explore_conversations")) return null;
    throw error;
  }
  return (data || []).map(normalizeInboxRow).filter((row) => row.id);
}

// Synchronous stale-first reads keep the message list and an opened thread on
// screen while Supabase refreshes them. These use the same per-user cache that
// the service already writes after every successful fetch.
export function readCachedExploreConversations(currentUserId) {
  if (!currentUserId) return [];
  return fetchLocalConversations(currentUserId);
}

export function readCachedExploreMessages(conversationId, currentUserId = "") {
  if (!conversationId || !currentUserId) return [];
  return readArray(MESSAGES_KEY, currentUserId).filter((message) => message.conversationId === conversationId);
}

export async function fetchExploreConversations(currentUserId) {
  if (!currentUserId) return [];

  const inboxRows = await fetchInboxRows();
  if (inboxRows) {
    const memberRows = inboxRows.flatMap((row) => (row.memberIds.length ? row.memberIds : row.participantIds)
      .map((userId) => ({ conversation_id: row.id, user_id: userId })));
    const [profiles, spacesById] = await Promise.all([
      fetchProfilesByIds(inboxRows.flatMap((row) => [...row.participantIds, ...row.memberIds])),
      fetchSpacesByIds(inboxRows.map((row) => row.spaceId)),
    ]);
    const nextConversations = dedupeExploreConversations(
      attachSpaceCounterparts(hydrateConversations(inboxRows, memberRows, profiles), spacesById),
    );
    writeConversations(nextConversations, currentUserId);
    return nextConversations;
  }

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
  const [profiles, spacesById] = await Promise.all([
    fetchProfilesByIds(allMembers.map((member) => member.user_id)),
    fetchSpacesByIds(conversations.map((conversation) => conversation.spaceId)),
  ]);
  const hydratedConversations = dedupeExploreConversations(
    attachSpaceCounterparts(hydrateConversations(conversations, allMembers, profiles), spacesById),
  );
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

// A Space's shared inbox: every thread people opened with the Space, readable
// by each team member allowed to reply (database policy). Cached per member
// AND per Space so it never mixes with the member's personal inbox.
export function readCachedExploreSpaceConversations(currentUserId, spaceId) {
  const cacheKey = spaceInboxCacheKey(currentUserId, spaceId);
  if (!currentUserId || !spaceId) return [];
  const messages = readArray(MESSAGES_KEY, cacheKey);
  return readConversations(cacheKey)
    .filter((conversation) => conversation.spaceId === spaceId)
    .map((conversation) => {
      const conversationMessages = messages.filter((message) => message.conversationId === conversation.id);
      return {
        ...conversation,
        lastMessage: newestMessage(conversationMessages[conversationMessages.length - 1], conversation.lastMessage),
        unreadCount: Number.isFinite(conversation.unreadCount)
          ? conversation.unreadCount
          : conversationMessages.filter((message) => message.senderId === conversation.customerId && !message.read).length,
      };
    });
}

function toSpaceInboxConversation(conversation, profiles) {
  const customerId = conversation.participantIds[0] || "";
  const customer = profiles[customerId] || { userId: customerId, displayName: "Profile", username: "user", avatarUrl: "" };
  return {
    ...conversation,
    spaceInbox: true,
    customerId,
    participants: { [customerId]: customer },
    counterpart: { ...customer, accountType: "personal" },
  };
}

export async function fetchExploreSpaceConversations(spaceId, currentUserId) {
  if (!isUuid(spaceId) || !currentUserId) return [];
  const cacheKey = spaceInboxCacheKey(currentUserId, spaceId);

  const inboxRows = await fetchInboxRows(spaceId);
  if (inboxRows) {
    const profiles = await fetchProfilesByIds(inboxRows.map((row) => row.participantIds[0]));
    const next = inboxRows.map((row) => toSpaceInboxConversation(row, profiles));
    writeConversations(next, cacheKey);
    return next;
  }

  const { data, error } = await supabase
    .from("explore_conversations")
    .select("*")
    .eq("space_id", spaceId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingMessageStore(error) || isMissingColumn(error, "space_id")) return readCachedExploreSpaceConversations(currentUserId, spaceId);
    throw error;
  }

  const conversations = (data || []).map(normalizeConversation);
  const conversationIds = conversations.map((conversation) => conversation.id);
  const [profiles, messageResult] = await Promise.all([
    fetchProfilesByIds(conversations.map((conversation) => conversation.participantIds[0])),
    conversationIds.length
      ? supabase.from("explore_messages").select("*").in("conversation_id", conversationIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (messageResult.error) {
    if (isMissingMessageStore(messageResult.error)) return readCachedExploreSpaceConversations(currentUserId, spaceId);
    throw messageResult.error;
  }

  const messages = (messageResult.data || []).map(normalizeMessage);
  writeArray(MESSAGES_KEY, messages, cacheKey);

  const next = conversations.map((conversation) => {
    const customerId = conversation.participantIds[0] || "";
    const customer = profiles[customerId] || { userId: customerId, displayName: "Profile", username: "user", avatarUrl: "" };
    const conversationMessages = messages.filter((message) => message.conversationId === conversation.id);
    return {
      ...conversation,
      spaceInbox: true,
      customerId,
      participants: { [customerId]: customer },
      counterpart: { ...customer, accountType: "personal" },
      lastMessage: conversationMessages[conversationMessages.length - 1] || null,
      // Unread for the team = the customer's messages nobody on the team has read.
      unreadCount: conversationMessages.filter((message) => message.senderId === customerId && !message.read).length,
    };
  });
  writeConversations(next, cacheKey);
  return next;
}

// Opens the person ↔ Space thread. With customerUserId, a Space team member is
// starting it with that person; otherwise the caller is messaging the Space.
export async function startExploreSpaceConversation(currentProfile, space, options = {}) {
  const profileUserId = currentProfile?.userId || currentProfile?.id || "";
  const currentUserId = await getAuthenticatedUserId(profileUserId);
  const spaceId = space?.spaceId || space?.identityId || space?.id || "";
  if (!isUuid(spaceId)) throw new Error("Unable to message this Space right now.");

  const { data, error } = await supabase
    .rpc("get_or_create_explore_space_conversation", {
      target_space_id: spaceId,
      customer_user_id: options.customerUserId || null,
    })
    .maybeSingle();

  if (error) {
    const message = String(error.message || "").toLowerCase();
    const missingRpc = error.code === "PGRST202" || (message.includes("get_or_create_explore_space_conversation") && message.includes("schema cache"));
    // Before the Space inbox migration is live, keep the old path working
    // (a direct chat with the Space owner) instead of a dead Message button.
    if (missingRpc && !options.customerUserId && isUuid(space?.ownerUserId) && space.ownerUserId !== currentUserId) {
      return startExploreConversation(currentProfile, { ...space, userId: space.ownerUserId });
    }
    throw error;
  }
  if (!data) throw new Error("Unable to message this Space right now.");

  const conversation = normalizeConversation(data);
  if (options.customerUserId) {
    const cacheKey = spaceInboxCacheKey(currentUserId, spaceId);
    const customer = {
      userId: options.customerUserId,
      displayName: options.customer?.displayName || options.customer?.name || "Profile",
      username: options.customer?.username || "user",
      avatarUrl: options.customer?.avatarUrl || options.customer?.avatar_url || "",
    };
    const inboxConversation = {
      ...conversation,
      spaceInbox: true,
      customerId: options.customerUserId,
      participants: { [options.customerUserId]: customer },
      counterpart: { ...customer, accountType: "personal" },
    };
    writeConversations([inboxConversation, ...readConversations(cacheKey).filter((item) => item.id !== conversation.id)], cacheKey);
    return inboxConversation;
  }

  const withSpace = {
    ...conversation,
    participants: {
      [currentUserId]: {
        userId: currentUserId,
        displayName: currentProfile?.displayName || currentProfile?.name || "You",
        username: currentProfile?.username || "you",
        avatarUrl: currentProfile?.avatarUrl || currentProfile?.avatar_url || "",
      },
    },
    counterpart: spaceCounterpart({
      id: spaceId,
      name: space?.displayName || space?.name,
      slug: space?.username || space?.slug,
      avatar_url: space?.avatarUrl || space?.avatar_url,
      owner_user_id: space?.ownerUserId || "",
      verified: space?.verified,
    }, spaceId),
  };
  writeConversations([withSpace, ...readConversations(currentUserId).filter((item) => item.id !== conversation.id)], currentUserId);
  return withSpace;
}

// One page of a thread, oldest first: the latest MESSAGE_PAGE_SIZE messages,
// or those older than options.before. Messages this account hid are left out
// by the server. Only the latest page is cached on the device.
export async function fetchExploreMessagePage(conversationId, currentUserId = "", options = {}) {
  const cachedMessages = () => readArray(MESSAGES_KEY, currentUserId).filter((message) => message.conversationId === conversationId);
  if (!conversationId) return { messages: [], hasMore: false };
  if (isLocalConversationId(conversationId)) return { messages: cachedMessages(), hasMore: false };

  const limit = Number(options.limit) > 0 ? Number(options.limit) : MESSAGE_PAGE_SIZE;
  const before = options.before || null;
  let rows = null;
  const { data, error } = await supabase.rpc("list_explore_messages", {
    p_conversation_id: conversationId,
    p_before: before,
    p_limit: limit,
  });

  if (!error) {
    rows = data || [];
  } else if (isMissingRpc(error, "list_explore_messages")) {
    let query = supabase
      .from("explore_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (before) query = query.lt("created_at", before);
    const fallback = await query;
    if (fallback.error) {
      if (isMissingMessageStore(fallback.error)) return { messages: before ? [] : cachedMessages(), hasMore: false };
      throw fallback.error;
    }
    rows = fallback.data || [];
  } else if (isMissingMessageStore(error)) {
    return { messages: before ? [] : cachedMessages(), hasMore: false };
  } else {
    throw error;
  }

  const page = rows.map(normalizeMessage).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!before) {
    const otherMessages = readArray(MESSAGES_KEY, currentUserId).filter((message) => message.conversationId !== conversationId);
    writeArray(MESSAGES_KEY, [...otherMessages, ...page], currentUserId);
  }
  return { messages: page, hasMore: rows.length >= limit };
}

export async function fetchExploreMessages(conversationId, currentUserId = "") {
  return (await fetchExploreMessagePage(conversationId, currentUserId)).messages;
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

// Photos, voice notes and videos sent in a conversation go to the private
// message bucket under <conversation>/<sender>/. Before that bucket exists the
// old public upload keeps sending working.
async function uploadPrivateMessageMedia(mediaUrl, type, conversationId, senderId) {
  const value = String(mediaUrl || "");
  if (!value.startsWith("data:") && !value.startsWith("blob:")) return value;

  const blob = value.startsWith("data:")
    ? dataUrlToBlob(value)
    : await fetch(value).then((response) => {
        if (!response.ok) throw new Error("Unable to prepare media for upload.");
        return response.blob();
      });
  const path = buildMessageMediaPath({
    conversationId,
    userId: senderId,
    type,
    mimeType: blob.type,
    stamp: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  if (!path) return uploadMediaDataUrl(value, type, senderId);

  const { error } = await supabase.storage.from(MESSAGE_MEDIA_BUCKET).upload(path, blob, {
    cacheControl: "3600",
    contentType: blob.type || undefined,
    upsert: false,
  });
  if (error) {
    if (/bucket not found/i.test(String(error.message || ""))) return uploadMediaDataUrl(value, type, senderId);
    throw error;
  }
  return toPrivateMediaRef(path);
}

function removePrivateMessageMedia(mediaUrl, senderId) {
  const path = privateMediaPath(mediaUrl);
  // Only the sender's own folder: the storage policy refuses anything else.
  if (!path || path.split("/")[1] !== senderId) return Promise.resolve();
  return Promise.resolve()
    .then(() => supabase.storage.from(MESSAGE_MEDIA_BUCKET).remove([path]))
    .catch(() => null);
}

const signedMediaCache = new Map();
const signedMediaRequests = new Map();

// { url, expiresAt } when this media can be shown right now: a fresh cached
// signed link for private media, or the stored URL of an older public one.
export function readSignedMessageMedia(mediaUrl) {
  if (!mediaUrl) return null;
  if (!isPrivateMediaRef(mediaUrl)) return { url: mediaUrl, expiresAt: Infinity };
  const entry = signedMediaCache.get(privateMediaPath(mediaUrl));
  return signedUrlIsFresh(entry) ? entry : null;
}

// A short-lived link for private message media, cached and shared between
// bubbles; it is renewed shortly before it expires.
export async function getSignedMessageMedia(mediaUrl) {
  const cached = readSignedMessageMedia(mediaUrl);
  if (cached) return cached;
  const path = privateMediaPath(mediaUrl);
  if (!path) return null;
  if (signedMediaRequests.has(path)) return signedMediaRequests.get(path);

  const request = supabase.storage
    .from(MESSAGE_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_MEDIA_TTL_SECONDS)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) throw error || new Error("Media unavailable.");
      const entry = { url: data.signedUrl, expiresAt: Date.now() + SIGNED_MEDIA_TTL_SECONDS * 1000 };
      signedMediaCache.set(path, entry);
      return entry;
    })
    .finally(() => signedMediaRequests.delete(path));
  signedMediaRequests.set(path, request);
  return request;
}

export async function sendExploreMessage(conversationId, senderProfile, body, options = {}) {
  const draft = normalizeMessageInput(body);
  if (!conversationId || (!draft.body && !draft.mediaUrl)) return null;

  const profileUserId = senderProfile?.userId || senderProfile?.id || "";
  const senderId = await getAuthenticatedUserId(profileUserId);
  const actorMetadata = await getMessageActorMetadata(senderProfile, senderId);
  const isLocalConversation = isLocalConversationId(conversationId);
  const mediaUrl = !isLocalConversation && draft.mediaUrl
    ? await uploadPrivateMessageMedia(draft.mediaUrl, draft.type, conversationId, senderId)
    : draft.mediaUrl;
  const message = {
    id: `message-${Date.now()}`,
    conversationId,
    senderId,
    body: draft.body,
    type: draft.type,
    mediaUrl,
    metadata: { ...(draft.metadata || {}), actor: actorMetadata },
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
    metadata: { ...(message.metadata || {}), actor: actorMetadata },
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
    // The message was refused (for example the recipient blocked the
    // sender): its file must not stay behind in storage.
    removePrivateMessageMedia(message.mediaUrl, senderId);
    removeLocalMessage(senderId, message.id);
    throw error;
  }

  await supabase.from("explore_conversations").update({ updated_at: message.createdAt }).eq("id", conversationId);
  const savedMessage = data ? normalizeMessage(data) : message;
  return savedMessage;
}

// options.fromSenderId (Space inbox): only that person's messages are marked
// read — a team member opening the thread must not mark a teammate's replies
// as "seen" by the customer. options.cacheKey picks the Space inbox cache.
export async function markExploreConversationRead(conversationId, currentUserId, options = {}) {
  const cacheKey = options.cacheKey || currentUserId;
  const fromSenderId = options.fromSenderId || "";
  const isIncoming = (senderId) => (fromSenderId ? senderId === fromSenderId : senderId !== currentUserId);
  const messages = readArray(MESSAGES_KEY, cacheKey).map((message) =>
    message.conversationId === conversationId && isIncoming(message.senderId) ? { ...message, read: true } : message,
  );
  writeArray(MESSAGES_KEY, messages, cacheKey);
  writeArray(
    CONVERSATIONS_KEY,
    readArray(CONVERSATIONS_KEY, cacheKey).map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
    )),
    cacheKey,
  );
  window.dispatchEvent(new CustomEvent(EXPLORE_MESSAGE_EVENT, { detail: { type: "read", conversationId, currentUserId } }));

  if (isLocalConversationId(conversationId)) {
    return;
  }

  let query = supabase
    .from("explore_messages")
    .update({ read: true })
    .eq("conversation_id", conversationId)
    .neq("sender_id", currentUserId)
    .eq("read", false);
  if (fromSenderId) query = query.eq("sender_id", fromSenderId);
  const { error } = await query;

  if (error && !isMissingMessageStore(error)) {
    throw error;
  }
}

export async function deleteExploreMessage(message, currentUserId, options = {}) {
  const messageId = typeof message === "string" ? message : message?.id;
  const conversationId = message?.conversationId || message?.conversation_id || "";
  if (!messageId || !currentUserId) return;

  removeLocalMessage(options.cacheKey || currentUserId, messageId);
  window.dispatchEvent(new CustomEvent(EXPLORE_MESSAGE_EVENT, {
    detail: { type: "delete", conversationId, messageId },
  }));

  if (!isUuid(messageId)) return;

  if (!options.forEveryone) {
    // "Hide for me" is kept on the server for this account, so the message
    // stays hidden on every device while others still see it.
    const { error } = await supabase
      .from("explore_message_hidden")
      .upsert({ user_id: currentUserId, message_id: messageId }, { onConflict: "user_id,message_id", ignoreDuplicates: true });
    if (error && !isMissingMessageStore(error)) throw error;
    return;
  }

  const { error } = await supabase
    .from("explore_messages")
    .delete()
    .eq("id", messageId)
    .eq("sender_id", currentUserId);

  if (error && !isMissingMessageStore(error)) {
    throw error;
  }
  await removePrivateMessageMedia(message?.mediaUrl || message?.media_url || "", currentUserId);
}

const activityChannels = new Map();

function recordExploreMessageActivity(nextActivity) {
  const activityMap = readObject(MESSAGE_ACTIVITY_KEY);
  activityMap[`${nextActivity.conversationId}:${nextActivity.userId}`] = nextActivity;
  writeObject(MESSAGE_ACTIVITY_KEY, activityMap);
  window.dispatchEvent(new CustomEvent(EXPLORE_MESSAGE_ACTIVITY_EVENT, { detail: nextActivity }));
}

export function setExploreMessageActivity(conversationId, userId, activity = "active") {
  if (!conversationId || !userId) return;

  const nextActivity = {
    conversationId: String(conversationId),
    userId,
    activity,
    updatedAt: new Date().toISOString(),
  };

  recordExploreMessageActivity(nextActivity);

  // Presence only reaches the other participant while the shared broadcast
  // channel is joined, which subscribeToExploreMessageActivity guarantees
  // whenever a conversation thread is open.
  const entry = activityChannels.get(String(conversationId));
  if (entry?.joined) {
    Promise.resolve(
      entry.channel.send({ type: "broadcast", event: "activity", payload: nextActivity }),
    ).catch(() => {});
  }
}

export async function hideCurrentExploreMessageActivity() {
  const { data } = await supabase.auth.getUser();
  const userId = data?.user?.id || "";
  if (!userId) return;

  const activity = Object.values(readObject(MESSAGE_ACTIVITY_KEY)).filter((item) => item.userId === userId);
  activity.forEach((item) => setExploreMessageActivity(item.conversationId, userId, "offline"));
}

export function subscribeToExploreMessageActivity(conversationId) {
  const key = String(conversationId || "");
  if (!key) return () => {};

  let entry = activityChannels.get(key);
  if (!entry) {
    const channel = supabase.channel(`explore-message-activity-${key}`, {
      config: { broadcast: { self: false } },
    });
    entry = { channel, refCount: 0, joined: false };
    channel.on("broadcast", { event: "activity" }, ({ payload }) => {
      if (!payload?.conversationId || !payload?.userId || !payload?.activity) return;
      recordExploreMessageActivity(payload);
    });
    channel.subscribe((status) => {
      entry.joined = status === "SUBSCRIBED";
    });
    activityChannels.set(key, entry);
  }

  entry.refCount += 1;
  return () => {
    entry.refCount -= 1;
    if (entry.refCount <= 0) {
      activityChannels.delete(key);
      supabase.removeChannel(entry.channel);
    }
  };
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
