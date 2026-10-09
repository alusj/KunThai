import { useMemo } from "react";

import { useExploreNotifications } from "../../../../Backend/hooks/useExploreNotifications";
import { useI18n } from "../../../../i18n";
import EmptyState from "../../shared/EmptyState";
import ErrorState from "../../shared/ErrorState";
import NotificationsList from "../../ExploreTabs/notification/list/NotificationsList";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import { t as i18nText } from "../../../../i18n/index";
import { uiText as translateUi } from "../../../../i18n/index.js";
import { filterActivityForIdentity } from "./activityIdentity";

export default function ActivityScreen({ currentUserId = "", hideHeader = false, onOpenNotification, spaceId = "", spaceName = "" }) {
  const { t } = useI18n();
  const { notifications, error, hasMore, loadMore, loading, loadingMore, markRead, retry } = useExploreNotifications(currentUserId);
  const visible = useMemo(() => filterActivityForIdentity(notifications, spaceId), [notifications, spaceId]);

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

      <div className="w-full space-y-3 px-4 py-4 sm:px-5">
        {spaceId && spaceName ? (
          <p className="rounded-2xl bg-sky-50 px-4 py-2.5 text-xs font-bold text-sky-800">
            {i18nText("exploreMessagesFix.activityForSpace", { name: spaceName })}
          </p>
        ) : null}

        {error ? <ErrorState message={translateUi(error)} onRetry={retry} /> : null}

        {loading && !visible.length ? (
          <ActivitySkeleton />
        ) : !visible.length ? (
          !error ? <EmptyState title={t("explore.noActivityYet")} message={t("explore.noActivityYetMsg")} /> : null
        ) : (
          <NotificationsList data={visible} onOpen={openNotification} />
        )}

        {visible.length && hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700 shadow-sm disabled:opacity-60"
          >
            {loadingMore ? i18nText("exploreMessagesFix.loadingMore") : i18nText("exploreMessagesFix.loadMore")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-10 w-10 flex-none animate-pulse rounded-full bg-slate-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-3/5 animate-pulse rounded-full bg-slate-200" />
            <div className="h-3 w-2/5 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
