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

function friendlyMessageError(err) {
  const message = String(err?.message || "");
  if (message.toLowerCase().includes("uuid") || message.includes("__")) {
    return "We could not open that conversation. Please try starting the chat again.";
  }
  return message || "Unable to load messages.";
}

export function useExploreMessages(currentProfile, initialRecipient) {
  const currentUserId = currentProfile?.userId || "";
  const [activeConversation, setActiveConversation] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(Boolean(currentUserId));
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [pendingMessageKeys, setPendingMessageKeys] = useState(new Set());

  async function reload() {
    if (!currentUserId) {
      setConversations([]);
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      setConversations(await fetchExploreConversations(currentUserId));
      if (activeConversation?.id) {
        setMessages(await fetchExploreMessages(activeConversation.id));
      }
    } catch (err) {
      setError(friendlyMessageError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [currentUserId, activeConversation?.id]);

  useEffect(() => {
    if (initialRecipient?.userId || initialRecipient?.username) {
      startExploreConversation(currentProfile, initialRecipient).then(async (conversation) => {
        setActiveConversation(conversation);
        setMessages(await fetchExploreMessages(conversation.id));
        setConversations(await fetchExploreConversations(currentUserId));
      }).catch((err) => setError(friendlyMessageError(err)));
    }
  }, [initialRecipient?.userId, initialRecipient?.username]);

  useEffect(() => {
    function handleMessageEvent() {
      reload();
    }

    const unsubscribeRealtime = subscribeToExploreMessages(currentUserId, handleMessageEvent);
    window.addEventListener(EXPLORE_MESSAGE_EVENT, handleMessageEvent);
    window.addEventListener("storage", handleMessageEvent);
    return () => {
      unsubscribeRealtime();
      window.removeEventListener(EXPLORE_MESSAGE_EVENT, handleMessageEvent);
      window.removeEventListener("storage", handleMessageEvent);
    };
  }, [activeConversation?.id, currentUserId]);

  useEffect(() => {
    if (!activeConversation?.id || !currentUserId || !readExploreSettings().messages.readReceipts) {
      return;
    }

    markExploreConversationRead(activeConversation.id, currentUserId).then(() => fetchExploreConversations(currentUserId).then(setConversations));
  }, [activeConversation?.id, currentUserId, messages.length]);

  async function openConversation(conversation) {
    setActiveConversation(conversation);
    try {
      setError("");
      setMessages(await fetchExploreMessages(conversation.id));
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
    const text = String(body || "").trim();
    const conversationId = activeConversation?.id;
    const signature = `${conversationId || ""}|${currentUserId}|${text}`;

    if (!conversationId || !text || pendingMessageKeys.has(signature)) {
      return { ok: false, duplicate: pendingMessageKeys.has(signature) };
    }

    const tempMessage = {
      id: `pending-message-${Date.now()}`,
      conversationId,
      senderId: currentUserId,
      body: text,
      type: "text",
      read: false,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setError("");
    setPendingMessageKeys((current) => new Set(current).add(signature));
    setMessages((current) => [...current, tempMessage]);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, preview: text, updatedAt: tempMessage.createdAt }
          : conversation,
      ),
    );

    try {
      const created = await sendExploreMessage(conversationId, currentProfile, text, { optimisticManaged: true });
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
