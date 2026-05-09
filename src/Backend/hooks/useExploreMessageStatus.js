import { useEffect, useMemo, useState } from "react";

import {
  EXPLORE_MESSAGE_ACTIVITY_EVENT,
  EXPLORE_MESSAGE_EVENT,
  fetchExploreConversations,
  fetchExploreMessageActivity,
} from "../services/explore/messageService";

function isFreshActivity(item) {
  return Date.now() - new Date(item.updatedAt || 0).getTime() < 15000;
}

export function useExploreMessageStatus(currentUserId = "") {
  const [conversations, setConversations] = useState(() => fetchExploreConversations(currentUserId));
  const [activity, setActivity] = useState(() => fetchExploreMessageActivity());

  useEffect(() => {
    function reloadMessages() {
      setConversations(fetchExploreConversations(currentUserId));
    }

    function reloadActivity() {
      setActivity(fetchExploreMessageActivity());
    }

    reloadMessages();
    reloadActivity();
    window.addEventListener(EXPLORE_MESSAGE_EVENT, reloadMessages);
    window.addEventListener(EXPLORE_MESSAGE_ACTIVITY_EVENT, reloadActivity);
    window.addEventListener("storage", reloadMessages);

    const interval = window.setInterval(reloadActivity, 5000);

    return () => {
      window.removeEventListener(EXPLORE_MESSAGE_EVENT, reloadMessages);
      window.removeEventListener(EXPLORE_MESSAGE_ACTIVITY_EVENT, reloadActivity);
      window.removeEventListener("storage", reloadMessages);
      window.clearInterval(interval);
    };
  }, [currentUserId]);

  return useMemo(() => {
    const unreadCount = conversations.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0);
    const liveActivity = activity.find((item) => item.userId !== currentUserId && isFreshActivity(item));
    const activeConversation = conversations.find((conversation) => Date.now() - new Date(conversation.updatedAt || 0).getTime() < 5 * 60 * 1000);

    return {
      unreadCount,
      activity: liveActivity?.activity || "",
      active: Boolean(liveActivity || activeConversation),
    };
  }, [activity, conversations, currentUserId]);
}
