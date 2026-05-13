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

function normalizeNotification(item) {
  return {
    ...item,
    time_label: item.time_label || formatRelativeTime(item.created_at),
  };
}

function notificationEnabled(item) {
  const settings = readExploreSettings().notifications;
  if (item.type === "like" || item.type === "save" || item.type === "share") return settings.reactions;
  if (item.type === "comment" || item.type === "reply" || item.type === "mention") return settings.comments;
  if (item.type === "follow") return settings.follows;
  if (item.type === "post") return settings.followedPosts;
  if (item.type === "message") return false;
  return settings.safetyAlerts;
}

export function useExploreNotifications() {
  const [notifications, setNotifications] = useState(() => NOTIFICATIONS_MEMORY.items || []);
  const [loading, setLoading] = useState(() => !NOTIFICATIONS_MEMORY.items?.length);
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
        const nextItems = await fetchExploreNotifications();
        if (active) {
          const visibleItems = nextItems.filter(notificationEnabled);
          NOTIFICATIONS_MEMORY.items = visibleItems;
          NOTIFICATIONS_MEMORY.savedAt = Date.now();
          setNotifications(visibleItems);
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
              const next = [nextItem, ...current.filter((item) => item.id !== nextItem.id)];
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
        const next = [nextItem, ...current.filter((item) => item.id !== nextItem.id)];
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
    error,
    markRead,
    markAllRead,
  };
}
