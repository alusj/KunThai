import { useEffect, useMemo, useState } from "react";
import { HiOutlineCheckCircle, HiOutlineCog6Tooth } from "react-icons/hi2";

import { useExploreFollows } from "../../../../Backend/hooks/useExploreFollows";
import { useExploreNotifications } from "../../../../Backend/hooks/useExploreNotifications";
import { useExplorePreferences } from "../../../../Backend/hooks/useExplorePreferences";
import { EXPLORE_NOTIFICATION_SEEN_SCOPE, markNotificationScopeVisited } from "../../../../Backend/services/notificationSeenStore";
import EmptyState from "../../shared/EmptyState";
import ErrorState from "../../shared/ErrorState";
import NotificationSettings from "./components/NotificationSettings";
import NotificationsList from "./list/NotificationsList";

export default function Notifications({ currentUserId, onOpenNotification }) {
  const { notifications, unreadCount, loading, loadingMore, hasMore, error, loadMore, markRead, markAllRead } = useExploreNotifications();
  const follows = useExploreFollows(currentUserId);
  const preferences = useExplorePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    markNotificationScopeVisited(EXPLORE_NOTIFICATION_SEEN_SCOPE);
  }, []);

  const tabs = useMemo(
    () => [
      { id: "all", label: "All", count: notifications.length },
      { id: "activity", label: "Activity", count: notifications.filter((item) => item.category === "activity").length },
      { id: "mentions", label: "Mentions", count: notifications.filter((item) => item.category === "mentions").length },
      { id: "connections", label: "Connections", count: notifications.filter((item) => item.category === "connections").length },
    ],
    [notifications],
  );

  const visibleNotifications = useMemo(() => {
    if (activeTab === "all") return notifications;
    return notifications.filter((item) => item.category === activeTab);
  }, [activeTab, notifications]);

  function toggleSetting(key) {
    preferences.updateSection("notifications", {
      [key]: preferences.settings.notifications[key] === false,
    });
  }

  async function openNotification(item) {
    const groupedItems = Array.isArray(item.groupedItems) ? item.groupedItems : [item];
    await Promise.all(groupedItems.filter((notification) => !notification.read).map((notification) => markRead(notification.id)));
    onOpenNotification?.(item);
  }

  async function followBack(item) {
    if (!item?.actor_user_id || follows.followedUsers.has(item.actor_user_id)) {
      return;
    }

    await follows.toggleFollow(item.actor_user_id);
  }

  return (
    <div className="w-full space-y-4 px-4 pt-4 sm:px-5">
      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Notifications</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{unreadCount ? `${unreadCount} unread` : "You're caught up"}</h3>
            
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={markAllRead}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-lg text-sky-700"
              aria-label="Mark all as read"
            >
              <HiOutlineCheckCircle />
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen((current) => !current)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-lg text-slate-700"
              aria-label="Notification settings"
            >
              <HiOutlineCog6Tooth />
            </button>
          </div>
        </div>

        {settingsOpen ? (
          <div className="mt-4">
            <NotificationSettings values={preferences.settings.notifications} onToggle={toggleSetting} />
          </div>
        ) : null}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 kuntai-scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex h-10 flex-none items-center gap-2 rounded-full px-4 text-sm font-black transition ${
              activeTab === tab.id ? "bg-slate-950 text-white shadow-sm" : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            }`}
          >
            {tab.label}
            {tab.count ? <span className={activeTab === tab.id ? "text-white/70" : "text-slate-400"}>{tab.count}</span> : null}
          </button>
        ))}
      </div>

      {error ? <ErrorState message={error} /> : null}

      {loading ? (
        <NotificationSkeletons />
      ) : !visibleNotifications.length ? (
        <EmptyState title="No notifications yet" message="When people interact with you, you'll see it here." />
      ) : (
        <>
          <NotificationsList data={visibleNotifications} followedUsers={follows.followedUsers} onFollowBack={followBack} onOpen={openNotification} />
          {hasMore ? (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="h-12 w-full rounded-[18px] bg-white text-sm font-black text-sky-700 shadow-sm transition hover:bg-sky-50 disabled:text-slate-400"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function NotificationSkeletons() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex gap-3 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-11 w-11 animate-pulse rounded-full bg-slate-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-4/5 animate-pulse rounded-full bg-slate-200" />
            <div className="h-3 w-2/5 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
