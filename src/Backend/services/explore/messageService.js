import supabase from "../../lib/supabaseClient";

const CONVERSATIONS_KEY = "explore-message-conversations";
const MESSAGES_KEY = "explore-message-items";
const MESSAGE_ACTIVITY_KEY = "explore-message-activity";
export const EXPLORE_MESSAGE_EVENT = "explore-message-event";
export const EXPLORE_MESSAGE_ACTIVITY_EVENT = "explore-message-activity";

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
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

function isMissingMessageStore(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes("does not exist") || message.includes("schema cache");
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
    type: row.type || "text",
    read: Boolean(row.read),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  };
}

function fetchLocalConversations(currentUserId) {
  const conversations = readArray(CONVERSATIONS_KEY);
  const messages = readArray(MESSAGES_KEY);

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

  const { data, error } = await supabase
    .from("explore_conversations")
    .select("*")
    .contains("participant_ids", [currentUserId])
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingMessageStore(error)) return fetchLocalConversations(currentUserId);
    throw error;
  }

  const conversations = (data || []).map(normalizeConversation);
  const conversationIds = conversations.map((conversation) => conversation.id);
  const { data: messageRows, error: messageError } = conversationIds.length
    ? await supabase.from("explore_messages").select("*").in("conversation_id", conversationIds).order("created_at", { ascending: true })
    : { data: [], error: null };

  if (messageError) {
    if (isMissingMessageStore(messageError)) return fetchLocalConversations(currentUserId);
    throw messageError;
  }

  const messages = (messageRows || []).map(normalizeMessage);
  writeArray(CONVERSATIONS_KEY, conversations);
  writeArray(MESSAGES_KEY, messages);

  return conversations
    .map((conversation) => {
      const conversationMessages = messages.filter((message) => message.conversationId === conversation.id);
      const lastMessage = conversationMessages[conversationMessages.length - 1] || null;
      const unreadCount = conversationMessages.filter((message) => message.senderId !== currentUserId && !message.read).length;
      return { ...conversation, lastMessage, unreadCount };
    })
    .sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt || 0) - new Date(a.lastMessage?.createdAt || a.updatedAt || 0));
}

export async function fetchExploreMessages(conversationId) {
  const { data, error } = await supabase
    .from("explore_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingMessageStore(error)) return readArray(MESSAGES_KEY).filter((message) => message.conversationId === conversationId);
    throw error;
  }

  const nextMessages = (data || []).map(normalizeMessage);
  const otherMessages = readArray(MESSAGES_KEY).filter((message) => message.conversationId !== conversationId);
  writeArray(MESSAGES_KEY, [...otherMessages, ...nextMessages]);
  return nextMessages;
}

export async function startExploreConversation(currentProfile, recipient) {
  const currentUserId = currentProfile?.userId || currentProfile?.id || "me";
  const recipientId = recipient?.userId || recipient?.id || recipient?.username || "unknown";
  const conversationId = getConversationId(currentUserId, recipientId);
  const conversations = readArray(CONVERSATIONS_KEY);
  const existing = conversations.find((conversation) => conversation.id === conversationId);

  if (existing) {
    return existing;
  }

  const conversation = {
    id: conversationId,
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

  writeArray(CONVERSATIONS_KEY, [conversation, ...conversations]);
  const { error } = await supabase.from("explore_conversations").upsert(
    {
      id: conversationId,
      participant_ids: conversation.participantIds,
      participants: conversation.participants,
      request: conversation.request,
      updated_at: conversation.updatedAt,
    },
    { onConflict: "id" },
  );

  if (error && !isMissingMessageStore(error)) {
    throw error;
  }

  return conversation;
}

export async function sendExploreMessage(conversationId, senderProfile, body) {
  const text = String(body || "").trim();
  if (!conversationId || !text) return null;

  const senderId = senderProfile?.userId || senderProfile?.id || "me";
  const message = {
    id: `message-${Date.now()}`,
    conversationId,
    senderId,
    body: text,
    type: "text",
    read: false,
    createdAt: new Date().toISOString(),
  };

  const messages = readArray(MESSAGES_KEY);
  writeArray(MESSAGES_KEY, [...messages, message]);

  const conversations = readArray(CONVERSATIONS_KEY).map((conversation) =>
    conversation.id === conversationId ? { ...conversation, updatedAt: message.createdAt } : conversation,
  );
  writeArray(CONVERSATIONS_KEY, conversations);
  window.dispatchEvent(new CustomEvent(EXPLORE_MESSAGE_EVENT, { detail: { type: "message", conversationId, message } }));

  const { error } = await supabase.from("explore_messages").insert({
    id: message.id,
    conversation_id: conversationId,
    sender_id: senderId,
    body: message.body,
    type: message.type,
    read: message.read,
    created_at: message.createdAt,
  });

  if (error) {
    if (isMissingMessageStore(error)) return message;
    throw error;
  }

  await supabase.from("explore_conversations").update({ updated_at: message.createdAt }).eq("id", conversationId);
  await notifyMessageRecipients(conversationId, senderProfile, message).catch(() => {});

  return message;
}

async function notifyMessageRecipients(conversationId, senderProfile, message) {
  const conversations = readArray(CONVERSATIONS_KEY);
  const conversation = conversations.find((item) => item.id === conversationId);
  const senderId = senderProfile?.userId || senderProfile?.id || "me";
  const recipientIds = (conversation?.participantIds || []).filter((id) => id && id !== senderId);

  if (!recipientIds.length) return;

  await supabase.from("explore_notifications").insert(
    recipientIds.map((userId) => ({
      user_id: userId,
      actor_user_id: senderId,
      actor_name: senderProfile?.displayName || senderProfile?.name || "Someone",
      actor_avatar_url: senderProfile?.avatarUrl || senderProfile?.avatar_url || "",
      type: "message",
      media_type: "message",
      message: `${senderProfile?.displayName || senderProfile?.name || "Someone"} sent you a message`,
      read: false,
      post_id: null,
      post_preview: message.body,
    })),
  );
}

export async function markExploreConversationRead(conversationId, currentUserId) {
  const messages = readArray(MESSAGES_KEY).map((message) =>
    message.conversationId === conversationId && message.senderId !== currentUserId ? { ...message, read: true } : message,
  );
  writeArray(MESSAGES_KEY, messages);
  window.dispatchEvent(new CustomEvent(EXPLORE_MESSAGE_EVENT, { detail: { type: "read", conversationId, currentUserId } }));

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

export function subscribeToExploreMessages(currentUserId, onChange) {
  if (!currentUserId) return () => {};

  const channel = supabase
    .channel(`explore-direct-messages-${currentUserId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "explore_messages" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "explore_conversations" }, onChange)
    .subscribe();

  return () => supabase.removeChannel(channel);
}
