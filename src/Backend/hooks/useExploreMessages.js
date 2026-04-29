import { useEffect, useMemo, useState } from "react";

import {
  fetchExploreConversations,
  fetchExploreMessages,
  markExploreConversationRead,
  sendExploreMessage,
  startExploreConversation,
} from "../services/explore/messageService";

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

  function openConversation(conversation) {
    setActiveConversation(conversation);
    setMessages(fetchExploreMessages(conversation.id));
    markExploreConversationRead(conversation.id, currentUserId);
    setConversations(fetchExploreConversations(currentUserId));
  }

  function closeConversation() {
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
  };
}
