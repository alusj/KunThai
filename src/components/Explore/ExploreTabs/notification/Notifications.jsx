import { useEffect, useState } from "react";
import { HiOutlineCheckCircle, HiOutlineCog6Tooth } from "react-icons/hi2";

import { useExploreNotifications } from "../../../../Backend/hooks/useExploreNotifications";
import { useExplorePreferences } from "../../../../Backend/hooks/useExplorePreferences";
import EmptyState from "../../shared/EmptyState";
import ErrorState from "../../shared/ErrorState";
import NotificationSettings from "./components/NotificationSettings";
import NotificationsList from "./list/NotificationsList";

export default function Notifications({ onOpenNotification }) {
  const { notifications, unreadCount, error, markRead, markAllRead } = useExploreNotifications();
  const preferences = useExplorePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (unreadCount > 0) {
      markAllRead();
    }
  }, [unreadCount]);

  function toggleSetting(key) {
    preferences.updateSection("notifications", {
      [key]: preferences.settings.notifications[key] === false,
    });
  }

  async function openNotification(item) {
    await markRead(item.id);
    onOpenNotification?.(item);
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

      {error ? <ErrorState message={error} /> : null}

      {!notifications.length ? (
        <EmptyState title="No notifications yet" message="When people interact with you, you'll see it here." />
      ) : (
        <NotificationsList data={notifications} onOpen={openNotification} />
      )}
    </div>
  );
}
