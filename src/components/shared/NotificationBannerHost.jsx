import { useEffect, useRef, useState } from "react";
import { HiOutlineBellAlert, HiOutlineChatBubbleLeftRight, HiOutlineXMark } from "react-icons/hi2";

import {
  BANNER_EVENT,
  isBannerContextActive,
  requestExploreScreen,
  showNotificationBanner,
} from "../../Backend/services/notificationBannerService";
import {
  fetchExploreConversations,
  requestConversationOpen,
} from "../../Backend/services/explore/messageService";
import {
  subscribeToExploreNotifications,
  subscribeToIncomingExploreMessages,
} from "../../Backend/services/explore/realtimeService";
import { readExploreSettings } from "../../Backend/services/explore/preferencesService";
import { haptics, sounds } from "../../Backend/services/feedbackService";

const BANNER_EXIT_MS = 280;
const BANNER_DURATION_MS = 6000;
const PER_SOURCE_COOLDOWN_MS = 4000;

const NOTIFICATION_LABELS = {
  reaction: "liked your post",
  comment: "commented on your post",
  reply: "replied to you",
  mention: "mentioned you",
  follow: "started following you",
  post: "shared a new post",
  share: "shared your post",
  save: "saved your post",
};

const NOTIFICATION_SETTING_KEYS = {
  reaction: "reactions",
  save: "reactions",
  comment: "comments",
  reply: "comments",
  mention: "mentions",
  follow: "follows",
  post: "followedPosts",
  share: "comments",
};

function getPartnerName(conversation, currentUserId) {
  const otherId = conversation?.participantIds?.find((id) => id !== currentUserId);
  return conversation?.participants?.[otherId]?.displayName || "";
}

function messagePreview(row) {
  const type = String(row?.media_type || row?.type || "text");
  if (type === "audio") return "Voice note";
  if (type === "image") return "Photo";
  if (type === "video") return "Video";
  return String(row?.body || "New message");
}

export default function NotificationBannerHost({ userId = "" }) {
  const [items, setItems] = useState([]);
  const timersRef = useRef(new Map());
  const cooldownRef = useRef(new Map());

  function dismissBanner(id) {
    if (!id) return;
    const existingTimer = timersRef.current.get(id);
    if (existingTimer) window.clearTimeout(existingTimer);

    setItems((current) => current.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
    const removalTimer = window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
      timersRef.current.delete(id);
    }, BANNER_EXIT_MS);
    timersRef.current.set(id, removalTimer);
  }

  useEffect(() => {
    const timers = timersRef.current;

    function handleBanner(event) {
      const banner = { ...(event.detail || {}), leaving: false };
      setItems((current) => [banner, ...current.filter((item) => item.contextKey !== banner.contextKey || !banner.contextKey)].slice(0, 3));
      const timer = window.setTimeout(() => dismissBanner(banner.id), BANNER_DURATION_MS);
      timers.set(banner.id, timer);
    }

    window.addEventListener(BANNER_EVENT, handleBanner);
    return () => {
      window.removeEventListener(BANNER_EVENT, handleBanner);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!userId) return undefined;
    const cooldowns = cooldownRef.current;

    function underCooldown(key) {
      const now = Date.now();
      if (now - (cooldowns.get(key) || 0) < PER_SOURCE_COOLDOWN_MS) return true;
      cooldowns.set(key, now);
      return false;
    }

    async function handleIncomingMessage(payload) {
      const row = payload?.new;
      const conversationId = row?.conversation_id;
      if (!row?.id || !conversationId || row.sender_id === userId) return;

      if (isBannerContextActive(`conversation:${conversationId}`)) {
        // Already reading this conversation: the message renders inline,
        // so only a light tap — no banner, no sound.
        haptics.light("messages");
        return;
      }
      if (readExploreSettings().notifications.messages === false) return;
      if (underCooldown(`message:${conversationId}`)) return;

      let title = "New message";
      let avatarUrl = "";
      try {
        const conversations = await fetchExploreConversations(userId);
        const conversation = conversations.find((item) => item.id === conversationId);
        const partnerName = getPartnerName(conversation, userId);
        if (partnerName) title = partnerName;
        const otherId = conversation?.participantIds?.find((id) => id !== userId);
        avatarUrl = conversation?.participants?.[otherId]?.avatarUrl || "";
      } catch {
        // The generic title still identifies the banner.
      }

      haptics.light("messages");
      sounds.notification("messages");
      showNotificationBanner({
        title,
        body: messagePreview(row),
        avatarUrl,
        tone: "message",
        contextKey: `conversation:${conversationId}`,
        openLabel: "Reply",
        onOpen: () => {
          requestConversationOpen(conversationId);
          requestExploreScreen("Messages");
        },
      });
    }

    function handleExploreNotification(payload) {
      const row = payload?.new;
      if (!row?.id || row.user_id !== userId || row.actor_user_id === userId) return;

      const type = String(row.type || "");
      const settings = readExploreSettings().notifications;
      const settingKey = NOTIFICATION_SETTING_KEYS[type];
      if (settingKey && settings[settingKey] === false) return;
      if (underCooldown(`notification:${type}:${row.actor_user_id || ""}`)) return;

      const actor = String(row.actor_name || "Someone");
      const action = NOTIFICATION_LABELS[type] || "sent you a notification";
      const preview = String(row.message || row.post_preview || "").slice(0, 90);

      haptics.light("explore");
      showNotificationBanner({
        title: `${actor} ${action}`,
        body: preview,
        avatarUrl: row.actor_avatar_url || "",
        tone: "activity",
        contextKey: `explore-notification:${type}`,
        openLabel: "View",
        onOpen: () => requestExploreScreen("Notifications"),
      });
    }

    const unsubscribeMessages = subscribeToIncomingExploreMessages(userId, handleIncomingMessage);
    const unsubscribeNotifications = subscribeToExploreNotifications(userId, handleExploreNotification);
    return () => {
      unsubscribeMessages();
      unsubscribeNotifications();
    };
  }, [userId]);

  if (!items.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[1300] flex flex-col items-center gap-2 px-3 sm:top-5">
      {items.map((item) => {
        const Icon = item.tone === "message" ? HiOutlineChatBubbleLeftRight : HiOutlineBellAlert;
        const motionClass = item.leaving ? "kt-toast-collapse-out" : "kt-toast-expand-in";
        return (
          <div
            key={item.id}
            role="status"
            className={`${motionClass} pointer-events-auto relative flex w-full max-w-[min(92vw,420px)] overflow-hidden rounded-[26px] border border-white/70 bg-white/95 p-1 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.20)] ring-1 ring-slate-950/5 backdrop-blur-xl`}
          >
            <button
              type="button"
              onClick={() => {
                item.onOpen?.();
                dismissBanner(item.id);
              }}
              className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left"
            >
              <span className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                {item.avatarUrl ? (
                  <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon className="text-xl" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-slate-950">{item.title}</span>
                {item.body ? <span className="kuntai-break mt-0.5 block text-sm font-semibold leading-5 text-slate-600">{item.body}</span> : null}
                {item.onOpen ? (
                  <span className="mt-1.5 inline-block text-xs font-black uppercase tracking-wide text-sky-700">{item.openLabel}</span>
                ) : null}
              </span>
            </button>
            <button
              type="button"
              onClick={() => dismissBanner(item.id)}
              className="m-2 flex h-9 w-9 flex-none items-center justify-center self-start rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
              aria-label="Dismiss notification"
            >
              <HiOutlineXMark />
            </button>
          </div>
        );
      })}
    </div>
  );
}
