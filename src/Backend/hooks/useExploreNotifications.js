import { useEffect, useState } from "react";

import supabase from "../lib/supabaseClient";
import {
  fetchExploreNotifications,
  formatRelativeTime,
  markAllExploreNotificationsRead,
  markExploreNotificationRead,
  NOTIFICATION_EVENT,
} from "../services/exploreService";
import { readExploreSettings } from "../services/explore/preferencesService";

const NOTIFICATIONS_MEMORY = {
  items: [],
  savedAt: 0,
};
const NOTIFICATIONS_MEMORY_TTL = 120_000;
const PAGE_SIZE = 30;
const HIGH_PRIORITY_TYPES = new Set(["comment", "reply", "mention", "follow", "message", "creator_reply", "thread_reply"]);
const MEDIUM_PRIORITY_TYPES = new Set(["like", "share", "save", "reaction"]);

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
  if (item.type === "like" || item.type === "save" || item.type === "share" || item.type === "reaction") return settings.reactions;
  if (item.type === "comment" || item.type === "reply" || item.type === "mention" || item.type === "creator_reply" || item.type === "thread_reply") return settings.comments;
  if (item.type === "follow") return settings.follows;
  if (item.type === "post") return settings.followedPosts;
  if (item.type === "message") return false;
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

export function useExploreNotifications() {
  const [notifications, setNotifications] = useState(() => NOTIFICATIONS_MEMORY.items || []);
  const [loading, setLoading] = useState(() => !NOTIFICATIONS_MEMORY.items?.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let channel = null;
    let currentUserId = "";

    async function load() {
      try {
        const hasCachedItems = Boolean(NOTIFICATIONS_MEMORY.items?.length);
        const fresh = hasCachedItems && Date.now() - NOTIFICATIONS_MEMORY.savedAt < NOTIFICATIONS_MEMORY_TTL;

        if (hasCachedItems) {
          setNotifications(NOTIFICATIONS_MEMORY.items.filter(notificationEnabled));
          setLoading(false);
        }

        if (fresh) {
          return;
        }

        if (!hasCachedItems) {
          setLoading(true);
        }
        setError("");
        const nextItems = await fetchExploreNotifications({ limit: PAGE_SIZE });
        if (active) {
          const visibleItems = nextItems.filter(notificationEnabled);
          NOTIFICATIONS_MEMORY.items = visibleItems;
          NOTIFICATIONS_MEMORY.savedAt = Date.now();
          setNotifications(visibleItems);
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
            if (!notificationEnabled(nextItem)) return;
            setNotifications((current) => {
              const next = mergeNotificationList([nextItem, ...current]);
              NOTIFICATIONS_MEMORY.items = next;
              NOTIFICATIONS_MEMORY.savedAt = Date.now();
              return next;
            });
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
            setNotifications((current) => {
              const next = current.map((item) => (item.id === nextItem.id ? { ...item, ...nextItem } : item));
              NOTIFICATIONS_MEMORY.items = next;
              NOTIFICATIONS_MEMORY.savedAt = Date.now();
              return next;
            });
          },
        )
        .subscribe();
    });

    function handleNotificationCreated(event) {
      if (!active || !event.detail) {
        return;
      }

      if (currentUserId && event.detail.user_id && event.detail.user_id !== currentUserId) {
        return;
      }

      const nextItem = normalizeNotification(event.detail);
      if (!notificationEnabled(nextItem)) {
        return;
      }
      setNotifications((current) => {
        const next = mergeNotificationList([nextItem, ...current]);
        NOTIFICATIONS_MEMORY.items = next;
        NOTIFICATIONS_MEMORY.savedAt = Date.now();
        return next;
      });
    }

    window.addEventListener(NOTIFICATION_EVENT, handleNotificationCreated);

    return () => {
      active = false;
      window.removeEventListener(NOTIFICATION_EVENT, handleNotificationCreated);
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
      const visibleItems = nextItems.filter(notificationEnabled);
      setNotifications((current) => {
        const next = mergeNotificationList([...current, ...visibleItems]);
        NOTIFICATIONS_MEMORY.items = next;
        NOTIFICATIONS_MEMORY.savedAt = Date.now();
        return next;
      });
      setHasMore(nextItems.length >= PAGE_SIZE);
    } catch (err) {
      setError(err.message || "Unable to load more notifications.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function markRead(notificationId) {
    setNotifications((current) => {
      const next = current.map((item) => (item.id === notificationId ? { ...item, read: true } : item));
      NOTIFICATIONS_MEMORY.items = next;
      return next;
    });

    try {
      const updated = await markExploreNotificationRead(notificationId, true);
      if (updated) {
        setNotifications((current) => {
          const next = current.map((item) => (item.id === notificationId ? { ...item, ...updated } : item));
          NOTIFICATIONS_MEMORY.items = next;
          return next;
        });
      }
    } catch (err) {
      setError(err.message || "Unable to update notification.");
    }
  }

  async function markAllRead() {
    setNotifications((current) => {
      const next = current.map((item) => ({ ...item, read: true }));
      NOTIFICATIONS_MEMORY.items = next;
      return next;
    });

    try {
      await markAllExploreNotificationsRead();
    } catch (err) {
      setError(err.message || "Unable to update notifications.");
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
