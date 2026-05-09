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

function normalizeNotification(item) {
  return {
    ...item,
    time_label: item.time_label || formatRelativeTime(item.created_at),
  };
}

function notificationEnabled(item) {
  const settings = readExploreSettings().notifications;
  if (item.type === "like" || item.type === "save") return settings.reactions;
  if (item.type === "comment" || item.type === "mention") return settings.comments;
  if (item.type === "follow") return settings.follows;
  if (item.type === "post") return settings.followedPosts;
  if (item.type === "message") return settings.messages;
  return settings.safetyAlerts;
}

export function useExploreNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let channel = null;
    let currentUserId = "";

    async function load() {
      try {
        setLoading(true);
        setError("");
        const nextItems = await fetchExploreNotifications();
        if (active) {
          setNotifications(nextItems.filter(notificationEnabled));
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
            setNotifications((current) => [nextItem, ...current.filter((item) => item.id !== nextItem.id)]);
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
            setNotifications((current) => current.map((item) => (item.id === nextItem.id ? { ...item, ...nextItem } : item)));
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
      setNotifications((current) => [nextItem, ...current.filter((item) => item.id !== nextItem.id)]);
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
    setNotifications((current) => current.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));

    try {
      const updated = await markExploreNotificationRead(notificationId, true);
      if (updated) {
        setNotifications((current) => current.map((item) => (item.id === notificationId ? { ...item, ...updated } : item)));
      }
    } catch (err) {
      setError(err.message || "Unable to update notification.");
    }
  }

  async function markAllRead() {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));

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
