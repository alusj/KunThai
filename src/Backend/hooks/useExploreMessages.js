import { useEffect, useMemo, useState } from "react";

import {
  fetchExploreConversations,
  fetchExploreMessages,
  EXPLORE_MESSAGE_EVENT,
  markExploreConversationRead,
  sendExploreMessage,
  setExploreMessageActivity,
  startExploreConversation,
} from "../services/explore/messageService";
import { readExploreSettings } from "../services/explore/preferencesService";

export function useExploreMessages(currentProfile, initialRecipient) {
  const currentUserId = currentProfile?.userId || "";
  const [activeConversation, setActiveConversation] = useState(null);
  const [conversations, setConversations] = useState(() => fetchExploreConversations(currentUserId));
  const [messages, setMessages] = useState([]);

  function reload() {
    setConversations(fetchExploreConversations(currentUserId));
    if (activeConversation?.id) {
      setMessages(fetchExploreMessages(activeConversation.id));
    }
  }

  useEffect(() => {
    if (initialRecipient?.userId || initialRecipient?.username) {
      const conversation = startExploreConversation(currentProfile, initialRecipient);
      setActiveConversation(conversation);
      setMessages(fetchExploreMessages(conversation.id));
      setConversations(fetchExploreConversations(currentUserId));
    }
  }, [initialRecipient?.userId, initialRecipient?.username]);

  useEffect(() => {
    function handleMessageEvent() {
      reload();
    }

    window.addEventListener(EXPLORE_MESSAGE_EVENT, handleMessageEvent);
    window.addEventListener("storage", handleMessageEvent);
    return () => {
      window.removeEventListener(EXPLORE_MESSAGE_EVENT, handleMessageEvent);
      window.removeEventListener("storage", handleMessageEvent);
    };
  }, [activeConversation?.id, currentUserId]);

  function openConversation(conversation) {
    setActiveConversation(conversation);
    setMessages(fetchExploreMessages(conversation.id));
    if (readExploreSettings().messages.readReceipts) {
      markExploreConversationRead(conversation.id, currentUserId);
    }
    setConversations(fetchExploreConversations(currentUserId));
  }

  function closeConversation() {
    setActivity("active");
    setActiveConversation(null);
    setMessages([]);
    reload();
  }

  function sendMessage(body) {
    const created = sendExploreMessage(activeConversation?.id, currentProfile, body);
    if (created) {
      setMessages(fetchExploreMessages(activeConversation.id));
      setConversations(fetchExploreConversations(currentUserId));
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
    inbox,
    messages,
    openConversation,
    reload,
    requests,
    sendMessage,
    setActivity,
  };
}
