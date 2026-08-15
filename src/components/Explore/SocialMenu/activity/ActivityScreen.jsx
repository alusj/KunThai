import { useExploreNotifications } from "../../../../Backend/hooks/useExploreNotifications";
import { useI18n } from "../../../../i18n";
import EmptyState from "../../shared/EmptyState";
import ErrorState from "../../shared/ErrorState";
import NotificationsList from "../../ExploreTabs/notification/list/NotificationsList";
import SocialScreenHeader from "../shared/SocialScreenHeader";

export default function ActivityScreen({ currentUserId = "", hideHeader = false, onOpenNotification }) {
  const { t } = useI18n();
  const { notifications, error, markRead } = useExploreNotifications(currentUserId);

  function openNotification(item) {
    const groupedItems = Array.isArray(item.groupedItems) ? item.groupedItems : [item];
    Promise.all(groupedItems.filter((notification) => !notification.read).map((notification) => markRead(notification.id))).catch(() => {});
    onOpenNotification?.(item);
  }

  return (
    <div>
      {!hideHeader ? (
        <SocialScreenHeader title={t("screens.ActivityTitle")} subtitle={t("screens.ActivitySubtitle")} />
      ) : null}

      <div className="w-full px-4 py-4 sm:px-5">
        {error ? <ErrorState message={error} /> : null}

        {!notifications.length ? (
          <EmptyState title={t("explore.noActivityYet")} message={t("explore.noActivityYetMsg")} />
        ) : (
          <NotificationsList data={notifications} onOpen={openNotification} />
        )}
      </div>
    </div>
  );
}
