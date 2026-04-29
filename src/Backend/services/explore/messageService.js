const CONVERSATIONS_KEY = "explore-message-conversations";
const MESSAGES_KEY = "explore-message-items";

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

function getConversationId(currentUserId, recipientId) {
  return [currentUserId || "me", recipientId || "unknown"].sort().join("__");
}

export function fetchExploreConversations(currentUserId) {
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

export function fetchExploreMessages(conversationId) {
  return readArray(MESSAGES_KEY).filter((message) => message.conversationId === conversationId);
}

export function startExploreConversation(currentProfile, recipient) {
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
        displayName: recipient?.displayName || recipient?.name || "KunThai User",
        username: recipient?.username || "user",
        avatarUrl: recipient?.avatarUrl || recipient?.avatar_url || "",
      },
    },
    request: false,
    updatedAt: new Date().toISOString(),
  };

  writeArray(CONVERSATIONS_KEY, [conversation, ...conversations]);
  return conversation;
}

export function sendExploreMessage(conversationId, senderProfile, body) {
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

  return message;
}

export function markExploreConversationRead(conversationId, currentUserId) {
  const messages = readArray(MESSAGES_KEY).map((message) =>
    message.conversationId === conversationId && message.senderId !== currentUserId ? { ...message, read: true } : message,
  );
  writeArray(MESSAGES_KEY, messages);
}
