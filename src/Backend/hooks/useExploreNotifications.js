import { useEffect, useState } from "react";

import supabase from "../lib/supabaseClient";
import {
  fetchExploreNotifications,
  formatRelativeTime,
  markAllExploreNotificationsRead,
  markExploreNotificationRead,
  NOTIFICATION_EVENT,
} from "../services/exploreService";
import { EXPLORE_SETTINGS_EVENT, readExploreSettings } from "../services/explore/preferencesService";
import { EXPLORE_NOTIFICATION_SEEN_SCOPE, markNotificationsSeen } from "../services/notificationSeenStore";

const NOTIFICATIONS_MEMORY = {
  items: [],
  savedAt: 0,
  userId: "",
};
const PAGE_SIZE = 30;
const HIGH_PRIORITY_TYPES = new Set(["comment", "reply", "mention", "follow", "message", "creator_reply", "thread_reply"]);
const MEDIUM_PRIORITY_TYPES = new Set(["like", "share", "save", "reaction", "repost"]);

function normalizeNotification(item) {
  return {
    ...item,
    priority: item.priority || (HIGH_PRIORITY_TYPES.has(item.type) ? "high" : MEDIUM_PRIORITY_TYPES.has(item.type) ? "medium" : "normal"),
    category: item.category || getCategory(item.type),
    group_key: item.group_key || `${item.type || "system"}:${item.post_id || item.comment_id || item.target_id || item.media_type || "account"}`,
    time_label: item.time_label || formatRelativeTime(item.created_at),
  };
}

function getCategory(type) {
  if (type === "mention" || type === "tag") return "mentions";
  if (type === "follow" || type === "connect" || type === "connection") return "connections";
  if (["new_login", "password_changed", "verification_approved", "report_update", "moderation_action"].includes(type)) return "system";
  return "activity";
}

function notificationEnabled(item) {
  const settings = readExploreSettings().notifications;
  if (item.type === "like" || item.type === "save" || item.type === "share" || item.type === "reaction" || item.type === "repost") return settings.reactions;
  if (item.type === "comment" || item.type === "reply" || item.type === "creator_reply" || item.type === "thread_reply") return settings.comments;
  if (item.type === "mention" || item.type === "tag") return settings.mentions;
  if (["follow", "connect", "connection", "connection_request"].includes(item.type)) return settings.follows;
  if (item.type === "post") return settings.followedPosts;
  if (item.type === "message") return settings.messages;
  if (["post_trending", "video_milestone", "profile_milestone", "follower_milestone"].includes(item.type)) return settings.milestones;
  return settings.safetyAlerts;
}

function mergeNotificationList(items) {
  const merged = new Map();

  items.forEach((item) => {
    if (!item?.id) return;
    const normalized = normalizeNotification(item);
    const existing = merged.get(normalized.id);
    merged.set(normalized.id, existing ? { ...existing, ...normalized } : normalized);
  });

  return Array.from(merged.values()).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

function storeNotificationMemory(items, userId = NOTIFICATIONS_MEMORY.userId) {
  const next = mergeNotificationList(items);
  NOTIFICATIONS_MEMORY.items = next;
  NOTIFICATIONS_MEMORY.savedAt = Date.now();
  NOTIFICATIONS_MEMORY.userId = userId || "";
  return next;
}

function visibleNotifications(items = NOTIFICATIONS_MEMORY.items) {
  return items.filter(notificationEnabled);
}

export function useExploreNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let channel = null;
    let currentUserId = "";

    async function load() {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const loadUserId = authData?.user?.id || "";
        const hasCachedItems = NOTIFICATIONS_MEMORY.userId === loadUserId && Boolean(NOTIFICATIONS_MEMORY.items?.length);
        if (hasCachedItems) {
          setNotifications(visibleNotifications());
          setLoading(false);
        }

        if (!hasCachedItems) {
          setLoading(true);
        }
        setError("");
        const nextItems = await fetchExploreNotifications({ limit: PAGE_SIZE });
        if (active) {
          const storedItems = storeNotificationMemory(nextItems, loadUserId);
          setNotifications(visibleNotifications(storedItems));
          setHasMore(nextItems.length >= PAGE_SIZE);
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to load notifications.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data?.user?.id) {
        return;
      }

      currentUserId = data.user.id;
      channel = supabase
        .channel(`explore-notifications-${currentUserId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "explore_notifications",
            filter: `user_id=eq.${currentUserId}`,
          },
          (payload) => {
            if (!active || !payload.new) {
              return;
            }

            const nextItem = normalizeNotification(payload.new);
            const storedItems = storeNotificationMemory([nextItem, ...NOTIFICATIONS_MEMORY.items], currentUserId);
            setNotifications(visibleNotifications(storedItems));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "explore_notifications",
            filter: `user_id=eq.${currentUserId}`,
          },
          (payload) => {
            if (!active || !payload.new) {
              return;
            }

            const nextItem = normalizeNotification(payload.new);
            const storedItems = storeNotificationMemory(
              NOTIFICATIONS_MEMORY.items.map((item) => (item.id === nextItem.id ? { ...item, ...nextItem } : item)),
              currentUserId,
            );
            setNotifications(visibleNotifications(storedItems));
          },
        )
        .subscribe();
    });

    function handleNotificationCreated(event) {
      if (!active || !event.detail) {
        return;
      }

      if (!currentUserId || event.detail.user_id !== currentUserId) {
        return;
      }

      const nextItem = normalizeNotification(event.detail);
      const storedItems = storeNotificationMemory([nextItem, ...NOTIFICATIONS_MEMORY.items], currentUserId);
      setNotifications(visibleNotifications(storedItems));
    }

    function handleSettingsUpdated() {
      if (!active) return;
      setNotifications(visibleNotifications());
    }

    window.addEventListener(NOTIFICATION_EVENT, handleNotificationCreated);
    window.addEventListener(EXPLORE_SETTINGS_EVENT, handleSettingsUpdated);

    return () => {
      active = false;
      window.removeEventListener(NOTIFICATION_EVENT, handleNotificationCreated);
      window.removeEventListener(EXPLORE_SETTINGS_EVENT, handleSettingsUpdated);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  async function loadMore() {
    const lastItem = notifications[notifications.length - 1];

    if (!lastItem?.created_at || loadingMore || !hasMore) {
      return;
    }

    try {
      setLoadingMore(true);
      setError("");
      const nextItems = await fetchExploreNotifications({ limit: PAGE_SIZE, before: lastItem.created_at });
      const storedItems = storeNotificationMemory([...NOTIFICATIONS_MEMORY.items, ...nextItems]);
      setNotifications(visibleNotifications(storedItems));
      setHasMore(nextItems.length >= PAGE_SIZE);
    } catch (err) {
      setError(err.message || "Unable to load more notifications.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function markRead(notificationId) {
    const selected = NOTIFICATIONS_MEMORY.items.find((item) => item.id === notificationId);
    if (selected) markNotificationsSeen(EXPLORE_NOTIFICATION_SEEN_SCOPE, [selected]);
    const optimisticItems = storeNotificationMemory(
      NOTIFICATIONS_MEMORY.items.map((item) => (item.id === notificationId ? { ...item, read: true } : item)),
    );
    setNotifications(visibleNotifications(optimisticItems));

    try {
      const updated = await markExploreNotificationRead(notificationId, true);
      if (updated) {
        const storedItems = storeNotificationMemory(
          NOTIFICATIONS_MEMORY.items.map((item) => (item.id === notificationId ? { ...item, ...updated } : item)),
        );
        setNotifications(visibleNotifications(storedItems));
      }
    } catch (err) {
      setError(err.message || "Unable to update notification.");
    }
  }

  async function markAllRead() {
    markNotificationsSeen(EXPLORE_NOTIFICATION_SEEN_SCOPE, NOTIFICATIONS_MEMORY.items);
    const optimisticItems = storeNotificationMemory(NOTIFICATIONS_MEMORY.items.map((item) => ({ ...item, read: true })));
    setNotifications(visibleNotifications(optimisticItems));

    try {
      await markAllExploreNotificationsRead();
      return { ok: true };
    } catch (err) {
      const message = err.message || "Unable to update notifications.";
      setError(message);
      return { ok: false, error: message };
    }
  }

  return {
    notifications,
    unreadCount: notifications.filter((item) => !item.read).length,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    markRead,
    markAllRead,
  };
}
