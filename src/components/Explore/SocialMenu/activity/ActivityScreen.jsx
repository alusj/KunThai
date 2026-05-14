import { useExploreNotifications } from "../../../../Backend/hooks/useExploreNotifications";
import EmptyState from "../../shared/EmptyState";
import ErrorState from "../../shared/ErrorState";
import NotificationsList from "../../ExploreTabs/notification/list/NotificationsList";
import SocialScreenHeader from "../shared/SocialScreenHeader";

export default function ActivityScreen({ hideHeader = false, onOpenNotification }) {
  const { notifications, error, markRead } = useExploreNotifications();

  async function openNotification(item) {
    const groupedItems = Array.isArray(item.groupedItems) ? item.groupedItems : [item];
    await Promise.all(groupedItems.filter((notification) => !notification.read).map((notification) => markRead(notification.id)));
    onOpenNotification?.(item);
  }

  return (
    <div>
      {!hideHeader ? (
        <SocialScreenHeader title="Activity" subtitle="Recent social reactions, comments, and account interactions." />
      ) : null}

      <div className="w-full px-4 py-4 sm:px-5">
        {error ? <ErrorState message={error} /> : null}

        {!notifications.length ? (
          <EmptyState title="No activity yet" message="When people interact with you, your activity will appear here." />
        ) : (
          <NotificationsList data={notifications} onOpen={openNotification} />
        )}
      </div>
    </div>
  );
}
