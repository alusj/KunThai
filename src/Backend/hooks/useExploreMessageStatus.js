import { useEffect, useMemo, useState } from "react";

import {
  dedupeExploreConversations,
  EXPLORE_MESSAGE_CACHE_CLEARED_EVENT,
  EXPLORE_MESSAGE_ACTIVITY_EVENT,
  EXPLORE_MESSAGE_EVENT,
  fetchExploreConversations,
  fetchExploreMessageActivity,
  subscribeToExploreMessages,
} from "../services/explore/messageService";
import { readExploreSettings } from "../services/explore/preferencesService";
import {
  EXPLORE_MESSAGE_SEEN_SCOPE,
  readNotificationScopeVisitedAt,
  subscribeNotificationSeen,
} from "../services/notificationSeenStore";

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
  const [messagesVisitedAt, setMessagesVisitedAt] = useState(() => readNotificationScopeVisitedAt(EXPLORE_MESSAGE_SEEN_SCOPE));

  useEffect(() => subscribeNotificationSeen((event) => {
    if (event.detail?.scope === EXPLORE_MESSAGE_SEEN_SCOPE || event.detail?.scope === "*") {
      setMessagesVisitedAt(readNotificationScopeVisitedAt(EXPLORE_MESSAGE_SEEN_SCOPE));
    }
  }), []);

  useEffect(() => {
    function reloadMessages() {
     fetchExploreConversations(currentUserId)
  .then((items) => {
    const deduped = dedupeExploreConversations(items);
    MESSAGE_STATUS_CACHE.set(currentUserId, { conversations: deduped, loadedAt: Date.now() });
    setConversations(deduped);
  })
  .catch(() => {
    setConversations(getCachedStatus(currentUserId).conversations || []);
  });
    }

    function reloadActivity() {
      setActivity(fetchExploreMessageActivity());
    }

    function clearMessageStatusCache() {
      MESSAGE_STATUS_CACHE.clear();
      setConversations([]);
      setActivity([]);
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
    window.addEventListener(EXPLORE_MESSAGE_CACHE_CLEARED_EVENT, clearMessageStatusCache);
    window.addEventListener("storage", reloadMessages);

    const interval = window.setInterval(reloadActivity, 30000);

    return () => {
      unsubscribeRealtime();
      window.removeEventListener(EXPLORE_MESSAGE_EVENT, reloadMessages);
      window.removeEventListener(EXPLORE_MESSAGE_ACTIVITY_EVENT, reloadActivity);
      window.removeEventListener(EXPLORE_MESSAGE_CACHE_CLEARED_EVENT, clearMessageStatusCache);
      window.removeEventListener("storage", reloadMessages);
      window.clearInterval(interval);
    };
  }, [currentUserId]);

  return useMemo(() => {
    const settings = readExploreSettings().messages;
    const unreadCount = conversations.reduce((total, conversation) => {
      const updatedAt = new Date(conversation.updatedAt || 0).getTime();
      if (messagesVisitedAt && Number.isFinite(updatedAt) && updatedAt > 0 && updatedAt <= messagesVisitedAt) return total;
      return total + (conversation.unreadCount || 0);
    }, 0);
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
  }, [activity, conversations, currentUserId, messagesVisitedAt]);
}
