import { useEffect, useMemo, useState } from "react";

import {
  EXPLORE_MESSAGE_ACTIVITY_EVENT,
  EXPLORE_MESSAGE_EVENT,
  fetchExploreConversations,
  fetchExploreMessageActivity,
  subscribeToExploreMessages,
} from "../services/explore/messageService";
import { readExploreSettings } from "../services/explore/preferencesService";

function isFreshActivity(item) {
  return Date.now() - new Date(item.updatedAt || 0).getTime() < 15000;
}
const MESSAGE_STATUS_CACHE = new Map();

function getCachedStatus(userId = "") {
  return MESSAGE_STATUS_CACHE.get(userId) || { conversations: [], loadedAt: 0 };
}

export function useExploreMessageStatus(currentUserId = "") {
  const [conversations, setConversations] = useState(() => getCachedStatus(currentUserId).conversations);
  const [activity, setActivity] = useState(() => fetchExploreMessageActivity());

  useEffect(() => {
    function reloadMessages() {
     fetchExploreConversations(currentUserId)
  .then((items) => {
    MESSAGE_STATUS_CACHE.set(currentUserId, { conversations: items, loadedAt: Date.now() });
    setConversations(items);
  })
  .catch(() => {
    setConversations(getCachedStatus(currentUserId).conversations || []);
  });
    }

    function reloadActivity() {
      setActivity(fetchExploreMessageActivity());
    }

    const cachedStatus = getCachedStatus(currentUserId);
    setConversations(cachedStatus.conversations);
    if (!cachedStatus.conversations.length || Date.now() - cachedStatus.loadedAt > 120000) {
  reloadMessages();
}
    reloadActivity();
    const unsubscribeRealtime = subscribeToExploreMessages(currentUserId, reloadMessages);
    window.addEventListener(EXPLORE_MESSAGE_EVENT, reloadMessages);
    window.addEventListener(EXPLORE_MESSAGE_ACTIVITY_EVENT, reloadActivity);
    window.addEventListener("storage", reloadMessages);

    const interval = window.setInterval(reloadActivity, 30000);

    return () => {
      unsubscribeRealtime();
      window.removeEventListener(EXPLORE_MESSAGE_EVENT, reloadMessages);
      window.removeEventListener(EXPLORE_MESSAGE_ACTIVITY_EVENT, reloadActivity);
      window.removeEventListener("storage", reloadMessages);
      window.clearInterval(interval);
    };
  }, [currentUserId]);

  return useMemo(() => {
    const settings = readExploreSettings().messages;
    const unreadCount = conversations.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0);
    const liveActivity = activity.find((item) => item.userId !== currentUserId && isFreshActivity(item));
    const activeConversation = conversations.find((conversation) => Date.now() - new Date(conversation.updatedAt || 0).getTime() < 5 * 60 * 1000);
    const visibleActivity = liveActivity && (
      (liveActivity.activity === "typing" && settings.showTypingStatus) ||
      (liveActivity.activity === "recording" && settings.allowVoiceNotes) ||
      (liveActivity.activity === "active" && settings.showActiveStatus)
    );

    return {
      unreadCount,
      activity: visibleActivity ? liveActivity.activity : "",
      active: Boolean(visibleActivity || (settings.showActiveStatus && activeConversation)),
    };
  }, [activity, conversations, currentUserId]);
}
