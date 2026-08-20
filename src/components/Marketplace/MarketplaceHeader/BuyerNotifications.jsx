import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, PackageCheck } from "lucide-react";

import { fetchBuyerOrders } from "../../../Backend/services/marketplace/buyerMarketplaceService";
import { buildBuyerOrderNotifications } from "../../../Backend/services/marketplace/marketplaceNotificationModels";
import {
  applySeenNotificationState,
  markNotificationsSeen,
  subscribeNotificationSeen,
} from "../../../Backend/services/notificationSeenStore";
import { useI18n, t } from "../../../i18n";
import AppBackTab from "../../shared/AppBackTab";
import AppPortal from "../../shared/AppPortal";
import { PremiumHeaderButton } from "../../shared/PremiumHeader";
import useBodyScrollLock from "../../shared/useBodyScrollLock";

const BUYER_NOTIFICATION_SCOPE = "urmall:buyer:notifications";
const BUYER_NOTIFICATION_READ_SCOPE = `${BUYER_NOTIFICATION_SCOPE}:read`;

function formatNotificationTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BuyerNotifications({ onOpenChange, onUnreadCountChange, onViewOrders }) {
  useI18n();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.unread).length,
    [notifications],
  );

  const refreshNotifications = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError("");

    try {
      const orders = await fetchBuyerOrders();
      const items = buildBuyerOrderNotifications(orders);
      const badgeItems = applySeenNotificationState(BUYER_NOTIFICATION_SCOPE, items);
      const readItems = applySeenNotificationState(BUYER_NOTIFICATION_READ_SCOPE, items);
      setNotifications(badgeItems.map((item, index) => ({
        ...item,
        read: readItems[index]?.unread === false,
      })));
    } catch (err) {
      setError(err.message || t("urmall.notifications.loadError"));
      setNotifications([]);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshNotifications().catch(() => {});
    // Events below refresh on real order changes; this poll is only a backstop.
    const intervalId = window.setInterval(() => refreshNotifications({ quiet: true }).catch(() => {}), 60000);
    const refresh = () => refreshNotifications({ quiet: true }).catch(() => {});
    window.addEventListener("marketplace-orders-updated", refresh);
    const unsubscribeSeen = subscribeNotificationSeen(refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("marketplace-orders-updated", refresh);
      unsubscribeSeen?.();
    };
  }, [refreshNotifications]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    const unseenItems = notifications.filter((item) => item.unread);
    if (!unseenItems.length) return;
    markNotificationsSeen(BUYER_NOTIFICATION_SCOPE, unseenItems);
    setNotifications((current) => current.map((item) => (
      item.unread ? { ...item, unread: false } : item
    )));
  }, [notifications, open]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function markRead(notification) {
    if (!notification || notification.read) return;
    markNotificationsSeen(BUYER_NOTIFICATION_READ_SCOPE, [notification]);
    setNotifications((current) => current.map((item) => (
      item.id === notification.id ? { ...item, read: true } : item
    )));
  }

  function viewOrder(notification) {
    markRead(notification);
    setOpen(false);
    onViewOrders?.(notification.orderId);
  }

  useBodyScrollLock(open);

  return (
    <>
      <PremiumHeaderButton
        active={open}
        accent="emerald"
        badge={unreadCount}
        icon={Bell}
        label={t("urmall.notifications.open")}
        onClick={() => setOpen(true)}
      />

      <AppPortal>
        <div
          aria-hidden={!open}
          inert={open ? undefined : "true"}
          className={`fixed inset-0 z-[1200] overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        >
          <button
            type="button"
            aria-label={t("urmall.notifications.close")}
            onClick={() => setOpen(false)}
            tabIndex={open ? 0 : -1}
            className={`absolute inset-0 border-0 bg-slate-950/45 p-0 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
          />

          <section
            className={`kt-urmall-screen-panel absolute right-0 top-0 flex h-full w-full max-w-md transform flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
          >
            <header className="kt-header-glass flex items-start gap-3 px-4 py-4">
              <AppBackTab
                onBack={() => setOpen(false)}
                label={t("urmall.shell.backToUrMall")}
                historyKey="urmall-buyer-notifications"
                iconSize={30}
                className="mt-0.5 shrink-0 rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
                useHistoryLayer={false}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">UrMall</p>
                <h2 className="mt-1 truncate text-xl font-black text-slate-950">{t("urmall.notifications.title")}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{t("urmall.notifications.subtitle")}</p>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
              {error ? (
                <NotificationState title={t("urmall.notifications.errorTitle")} body={error} />
              ) : loading && notifications.length === 0 ? (
                <NotificationState title={t("urmall.notifications.loadingTitle")} body={t("urmall.notifications.loadingBody")} />
              ) : notifications.length === 0 ? (
                <NotificationState title={t("urmall.notifications.emptyTitle")} body={t("urmall.notifications.emptyBody")} />
              ) : (
                <div className="space-y-3">
                  {notifications.map((notification) => (
                    <article
                      key={notification.id}
                      onClick={() => markRead(notification)}
                      className={`rounded-2xl border p-3 ${!notification.read ? "border-emerald-100 bg-emerald-50" : "border-slate-100 bg-white"}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                          <PackageCheck size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-black text-slate-950">{notification.title}</h3>
                          <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">{notification.body}</p>
                          {notification.createdAt ? (
                            <p className="mt-1 text-xs font-bold text-slate-400">{formatNotificationTime(notification.createdAt)}</p>
                          ) : null}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              viewOrder(notification);
                            }}
                            className="kt-touchable mt-3 text-sm font-black text-emerald-700 hover:text-emerald-800"
                          >
                            {notification.actionLabel}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </AppPortal>
    </>
  );
}

function NotificationState({ title, body }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 text-center">
      <Bell className="mx-auto text-slate-300" size={28} />
      <h3 className="mt-3 text-sm font-black text-slate-950">{title}</h3>
      <p className="mt-1 text-sm font-semibold text-slate-500">{body}</p>
    </div>
  );
}
