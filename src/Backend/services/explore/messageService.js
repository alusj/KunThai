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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function isLocalConversationId(value) {
  return !isUuid(value);
}

function isMissingMessageStore(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes("does not exist") || message.includes("schema cache");
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
    read: Boolean(row.read),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  };
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
  writeArray(CONVERSATIONS_KEY, hydratedConversations);
  writeArray(MESSAGES_KEY, messages);

  return hydratedConversations
    .map((conversation) => {
      const conversationMessages = messages.filter((message) => message.conversationId === conversation.id);
      const lastMessage = conversationMessages[conversationMessages.length - 1] || null;
      const unreadCount = conversationMessages.filter((message) => message.senderId !== currentUserId && !message.read).length;
      return { ...conversation, lastMessage, unreadCount };
    })
    .sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt || 0) - new Date(a.lastMessage?.createdAt || a.updatedAt || 0));
}

export async function fetchExploreMessages(conversationId) {
  if (!conversationId) return [];
  if (isLocalConversationId(conversationId)) {
    return readArray(MESSAGES_KEY).filter((message) => message.conversationId === conversationId);
  }

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
  const currentUserId = currentProfile?.userId || currentProfile?.id || "";
  const recipientId = recipient?.userId || recipient?.id || "";
  if (!isUuid(currentUserId) || !isUuid(recipientId)) {
    throw new Error("Unable to start this chat right now.");
  }

  const localConversationId = getConversationId(currentUserId, recipientId);
  const conversationKey = localConversationId;
  const conversations = readArray(CONVERSATIONS_KEY);
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
    writeArray(CONVERSATIONS_KEY, [normalized, ...conversations.filter((item) => item.id !== normalized.id)]);
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
        writeArray(CONVERSATIONS_KEY, [normalized, ...conversations.filter((item) => item.id !== normalized.id)]);
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
    writeArray(CONVERSATIONS_KEY, [conversation, ...conversations]);
    return conversation;
  }

  const remoteConversation = { ...conversation, id: createdConversation.id };
  const { error: membersError } = await supabase.from("explore_conversation_members").upsert(
    [
      { conversation_id: remoteConversation.id, user_id: currentUserId },
      { conversation_id: remoteConversation.id, user_id: recipientId },
    ],
    { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
  );

  if (membersError && !isMissingMessageStore(membersError)) {
    throw membersError;
  }

  writeArray(CONVERSATIONS_KEY, [remoteConversation, ...conversations]);
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

  if (!options.optimisticManaged) {
    const messages = readArray(MESSAGES_KEY);
    writeArray(MESSAGES_KEY, [...messages, message]);
  }

  const conversations = readArray(CONVERSATIONS_KEY).map((conversation) =>
    conversation.id === conversationId ? { ...conversation, updatedAt: message.createdAt } : conversation,
  );
  writeArray(CONVERSATIONS_KEY, conversations);
  if (!options.optimisticManaged) {
    window.dispatchEvent(new CustomEvent(EXPLORE_MESSAGE_EVENT, { detail: { type: "message", conversationId, message } }));
  }

  if (isLocalConversationId(conversationId)) {
    return message;
  }

  const { data, error } = await supabase.from("explore_messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    body: message.body,
    media_type: message.type,
    read: message.read,
    created_at: message.createdAt,
  }).select().single();

  if (error) {
    if (isMissingMessageStore(error)) return message;
    throw error;
  }

  await supabase.from("explore_conversations").update({ updated_at: message.createdAt }).eq("id", conversationId);
  const savedMessage = data ? normalizeMessage(data) : message;
  return savedMessage;
}

export async function markExploreConversationRead(conversationId, currentUserId) {
  const messages = readArray(MESSAGES_KEY).map((message) =>
    message.conversationId === conversationId && message.senderId !== currentUserId ? { ...message, read: true } : message,
  );
  writeArray(MESSAGES_KEY, messages);
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

export function subscribeToExploreMessages(currentUserId, onChange) {
  if (!currentUserId) return () => {};

  const channel = supabase
    .channel(`explore-direct-messages-${currentUserId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "explore_messages" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "explore_conversations" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "explore_conversation_members" }, onChange)
    .subscribe();

  return () => supabase.removeChannel(channel);
}
