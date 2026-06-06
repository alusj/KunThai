import { useEffect, useMemo, useState } from "react";

import {
  fetchExploreConversations,
  fetchExploreMessages,
  EXPLORE_MESSAGE_EVENT,
  markExploreConversationRead,
  sendExploreMessage,
  setExploreMessageActivity,
  startExploreConversation,
  subscribeToExploreMessages,
} from "../services/explore/messageService";
import { readExploreSettings } from "../services/explore/preferencesService";

const MESSAGES_MEMORY = new Map();
const MESSAGES_MEMORY_TTL = 120_000;

function normalizeOutgoingMessage(input) {
  if (typeof input === "string") {
    return { body: input.trim(), mediaUrl: "", type: "text" };
  }

  const body = String(input?.body || "").trim();
  const mediaUrl = String(input?.media_url || input?.mediaUrl || "").trim();
  const requestedType = String(input?.type || input?.media_type || "").toLowerCase();
  const type = ["image", "audio", "video"].includes(requestedType)
    ? requestedType
    : mediaUrl
      ? "image"
      : "text";

  return {
    body,
    mediaUrl,
    type: mediaUrl ? type : "text",
  };
}

function getMessagePreview(message) {
  if (message.body) return message.body;
  if (message.type === "image") return "Photo";
  if (message.type === "audio") return "Voice note";
  if (message.type === "video") return "Video";
  return "Message";
}

function friendlyMessageError(err) {
  const message = String(err?.message || "");
  if (message.toLowerCase().includes("uuid") || message.includes("__")) {
    return "We could not open that conversation. Please try starting the chat again.";
  }
  return message || "Unable to load messages.";
}

export function useExploreMessages(currentProfile, initialRecipient) {
  const currentUserId = currentProfile?.userId || "";
  const memory = MESSAGES_MEMORY.get(currentUserId) || {};
  const [activeConversation, setActiveConversation] = useState(null);
  const [conversations, setConversations] = useState(() => memory.conversations || []);
  const [loading, setLoading] = useState(() => Boolean(currentUserId && !memory.conversations?.length));
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [pendingMessageKeys, setPendingMessageKeys] = useState(new Set());

  useEffect(() => {
    if (!currentUserId) return;
    const currentMemory = MESSAGES_MEMORY.get(currentUserId) || {};
    const messagesByConversation = { ...(currentMemory.messagesByConversation || {}) };

    if (activeConversation?.id) {
      messagesByConversation[activeConversation.id] = messages;
    }

    MESSAGES_MEMORY.set(currentUserId, {
      ...currentMemory,
      conversations,
      messagesByConversation,
      savedAt: Date.now(),
    });
  }, [activeConversation?.id, conversations, currentUserId, messages]);

  function cacheConversationMessages(conversationId, nextMessages) {
    if (!currentUserId || !conversationId) return;
    const currentMemory = MESSAGES_MEMORY.get(currentUserId) || {};
    MESSAGES_MEMORY.set(currentUserId, {
      ...currentMemory,
      messagesByConversation: {
        ...(currentMemory.messagesByConversation || {}),
        [conversationId]: nextMessages,
      },
      savedAt: Date.now(),
    });
  }

  async function reload() {
    if (!currentUserId) {
      setConversations([]);
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      const cached = MESSAGES_MEMORY.get(currentUserId);
      const hasCachedConversations = Boolean(cached?.conversations?.length || conversations.length);
      const fresh = cached?.conversations?.length && Date.now() - cached.savedAt < MESSAGES_MEMORY_TTL;

      if (cached?.conversations) {
        setConversations(cached.conversations);
        if (activeConversation?.id && cached.messagesByConversation?.[activeConversation.id]) {
          setMessages(cached.messagesByConversation[activeConversation.id]);
        }
        setLoading(false);
      }

      if (fresh) {
        if (activeConversation?.id && !cached.messagesByConversation?.[activeConversation.id]) {
          const nextMessages = await fetchExploreMessages(activeConversation.id, currentUserId);
          setMessages(nextMessages);
          cacheConversationMessages(activeConversation.id, nextMessages);
        }
        return;
      }

      if (!hasCachedConversations) {
        setLoading(true);
      }
      setError("");
      const nextConversations = await fetchExploreConversations(currentUserId);
      setConversations(nextConversations);
      if (activeConversation?.id) {
        const nextMessages = await fetchExploreMessages(activeConversation.id, currentUserId);
        setMessages(nextMessages);
        cacheConversationMessages(activeConversation.id, nextMessages);
      }
    } catch (err) {
      setError(friendlyMessageError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // reload is intentionally scoped to the active user/conversation state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, activeConversation?.id]);

  useEffect(() => {
    if (initialRecipient?.userId || initialRecipient?.username) {
      startExploreConversation(currentProfile, initialRecipient).then(async (conversation) => {
        const nextMessages = await fetchExploreMessages(conversation.id, currentUserId);
        setMessages(nextMessages);
        cacheConversationMessages(conversation.id, nextMessages);
        setActiveConversation(conversation);
        setConversations(await fetchExploreConversations(currentUserId));
      }).catch((err) => setError(friendlyMessageError(err)));
    }
    // Only the target recipient identity should open the initial chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecipient?.userId, initialRecipient?.username]);

  useEffect(() => {
    function handleMessageEvent() {
      reload();
    }

    const unsubscribeRealtime = subscribeToExploreMessages(currentUserId, handleMessageEvent, conversations.map((conversation) => conversation.id));
    window.addEventListener(EXPLORE_MESSAGE_EVENT, handleMessageEvent);
    window.addEventListener("storage", handleMessageEvent);
    return () => {
      unsubscribeRealtime();
      window.removeEventListener(EXPLORE_MESSAGE_EVENT, handleMessageEvent);
      window.removeEventListener("storage", handleMessageEvent);
    };
    // Realtime subscription is keyed by user, active conversation, and known ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation?.id, currentUserId, conversations]);

  useEffect(() => {
    if (!activeConversation?.id || !currentUserId || !readExploreSettings().messages.readReceipts) {
      return;
    }

    markExploreConversationRead(activeConversation.id, currentUserId).then(() => fetchExploreConversations(currentUserId).then(setConversations));
  }, [activeConversation?.id, currentUserId, messages.length]);

  async function openConversation(conversation) {
    const cachedMessages = MESSAGES_MEMORY.get(currentUserId)?.messagesByConversation?.[conversation.id] || [];
    setMessages(cachedMessages);
    setActiveConversation(conversation);
    try {
      setError("");
      const nextMessages = await fetchExploreMessages(conversation.id, currentUserId);
      setMessages(nextMessages);
      cacheConversationMessages(conversation.id, nextMessages);
      if (readExploreSettings().messages.readReceipts) {
        await markExploreConversationRead(conversation.id, currentUserId);
      }
      setConversations(await fetchExploreConversations(currentUserId));
    } catch (err) {
      setError(friendlyMessageError(err));
    }
  }

  function closeConversation() {
    setActivity("active");
    setActiveConversation(null);
    setMessages([]);
    reload();
  }

  async function sendMessage(body) {
    const draft = normalizeOutgoingMessage(body);
    const conversationId = activeConversation?.id;
    const signature = [conversationId || "", currentUserId, draft.type, draft.body, draft.mediaUrl].join("|");

    if (!conversationId || (!draft.body && !draft.mediaUrl) || pendingMessageKeys.has(signature)) {
      return { ok: false, duplicate: pendingMessageKeys.has(signature) };
    }

    const tempMessage = {
      id: `pending-message-${Date.now()}`,
      conversationId,
      senderId: currentUserId,
      body: draft.body,
      type: draft.mediaUrl ? draft.type : "text",
      mediaUrl: draft.mediaUrl,
      read: false,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    const preview = getMessagePreview(tempMessage);

    setError("");
    setPendingMessageKeys((current) => new Set(current).add(signature));
    setMessages((current) => [...current, tempMessage]);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, preview, updatedAt: tempMessage.createdAt }
          : conversation,
      ),
    );

    try {
      const created = await sendExploreMessage(conversationId, currentProfile, body, { optimisticManaged: true });
      if (created) {
        setMessages((current) => current.map((message) => (message.id === tempMessage.id ? created : message)));
        setConversations(await fetchExploreConversations(currentUserId));
      }
      return { ok: true, message: created || tempMessage };
    } catch (err) {
      setMessages((current) => current.filter((message) => message.id !== tempMessage.id));
      setError("Message failed. Try again.");
      return { ok: false, error: friendlyMessageError(err) };
    } finally {
      setPendingMessageKeys((current) => {
        const next = new Set(current);
        next.delete(signature);
        return next;
      });
    }
  }

  function setActivity(activity) {
    const settings = readExploreSettings().messages;
    if (activity === "typing" && !settings.showTypingStatus) return;
    if (activity === "recording" && !settings.allowVoiceNotes) return;
    if (activity === "active" && !settings.showActiveStatus) return;
    setExploreMessageActivity(activeConversation?.id, currentUserId, activity);
  }

  const requests = useMemo(() => conversations.filter((conversation) => conversation.request), [conversations]);
  const inbox = useMemo(() => conversations.filter((conversation) => !conversation.request), [conversations]);

  return {
    activeConversation,
    closeConversation,
    conversations,
    error,
    inbox,
    loading,
    messages,
    openConversation,
    reload,
    requests,
    sendMessage,
    setActivity,
  };
}
