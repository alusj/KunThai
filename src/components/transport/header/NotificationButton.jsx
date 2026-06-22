// NotificationButton.jsx
// Displays operator or passenger transport notifications.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Truck } from "lucide-react";

import AppBackTab from "../../shared/AppBackTab.jsx";
import AppPortal from "../../shared/AppPortal";
import useBodyScrollLock from "../../shared/useBodyScrollLock";
import { PremiumHeaderButton } from "../../shared/PremiumHeader";
import {
  applySeenNotificationState,
  markNotificationsSeen,
  subscribeNotificationSeen,
} from "../../../Backend/services/notificationSeenStore";
import { fetchTransportNotifications } from "../../services/transportHeaderService";
import { subscribePassengerTrips } from "../../services/passengerTransportService";
import { showToast } from "../../../Backend/services/toastService";

export default function NotificationButton({ active = false, companyAccount, operatorAccount, onOpenChange, onUnreadCountChange, onViewFleet }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const previousActiveRef = useRef(false);
  const previousUnreadIdsRef = useRef(new Set());
  const seenScope = `transport:${companyAccount?.id || operatorAccount?.id || "passenger"}`;

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.unread).length,
    [notifications],
  );

  const refreshNotifications = useCallback(({ quiet = false } = {}) => {
    let alive = true;
    if (open && !quiet) setLoading(true);
    setError("");

    fetchTransportNotifications(operatorAccount, companyAccount)
      .then((items) => {
        if (!alive) return;
        const nextItems = open
          ? applySeenNotificationState(seenScope, items.map((item) => ({ ...item, unread: false })))
          : applySeenNotificationState(seenScope, items);
        if (open) markNotificationsSeen(seenScope, items);
        setNotifications(nextItems);

      })
      .catch((err) => {
        if (alive) {
          setError(err.message || "Unable to load transport notifications.");
          setNotifications([]);
        }
      })
      .finally(() => {
        if (alive && open && !quiet) setLoading(false);
      });

    return () => {
      alive = false;
    };
    }, [companyAccount, open, operatorAccount, seenScope]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  useEffect(() => {
    const becameActive = active && !previousActiveRef.current;
    const unreadNotifications = notifications.filter((notification) => notification.unread);
    const newUnread = unreadNotifications.find((notification) => !previousUnreadIdsRef.current.has(notification.id));
    previousActiveRef.current = active;
    previousUnreadIdsRef.current = new Set(unreadNotifications.map((notification) => notification.id));
    if (!active || !unreadCount || (!becameActive && !newUnread)) return;
    const newest = newUnread || unreadNotifications[0];
    if (newest) showToast(getTransportToastMessage(newest, companyAccount, operatorAccount), "info", { title: "Transport update" });
  }, [active, companyAccount, notifications, operatorAccount, unreadCount]);

  useEffect(() => subscribeNotificationSeen(() => refreshNotifications({ quiet: true })), [refreshNotifications]);

  useEffect(() => {
    return refreshNotifications({ quiet: !open });
  }, [open, refreshNotifications]);

  useEffect(() => {
    const refreshQuietly = () => refreshNotifications({ quiet: true });
    const unsubscribe = subscribePassengerTrips(refreshQuietly);
    window.addEventListener("transport-trip-updated", refreshQuietly);
    window.addEventListener("transport-booking-created", refreshQuietly);

    return () => {
      unsubscribe?.();
      window.removeEventListener("transport-trip-updated", refreshQuietly);
      window.removeEventListener("transport-booking-created", refreshQuietly);
    };
  }, [refreshNotifications]);

  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) return;

    setNotifications((current) => {
      if (!current.length) return current;
      markNotificationsSeen(seenScope, current);
      if (!current.some((notification) => notification.unread)) return current;
      return current.map((notification) => (
        notification.unread ? { ...notification, unread: false } : notification
      ));
    });
  }, [notifications.length, open, seenScope]);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <div className="relative">
        <PremiumHeaderButton
          badge={unreadCount}
          icon={Bell}
          label="Open transport notifications"
          onClick={() => setOpen(true)}
          title="Open transport notifications"
        />
        {unreadCount > 0 && !open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="absolute right-0 top-[calc(100%+0.55rem)] z-50 w-40 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-left text-xs font-black text-slate-700 shadow-xl shadow-slate-900/10"
          >
            New transport alert
            <span className="absolute -top-1 right-5 h-3 w-3 rotate-45 border-l border-t border-emerald-100 bg-white" />
          </button>
        ) : null}
      </div>

      <AppPortal>
        <div
          aria-hidden={!open}
          inert={open ? undefined : "true"}
          className={`fixed inset-0 z-[1200] overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        >
          <button
            type="button"
            aria-label="Close transport notifications overlay"
            onClick={() => setOpen(false)}
            tabIndex={open ? 0 : -1}
            className={`absolute inset-0 border-0 bg-slate-950/45 p-0 backdrop-blur-sm transition-opacity duration-300 ${
              open ? "opacity-100" : "opacity-0"
            }`}
          />

          <section
            className={`kt-urmall-screen-panel absolute right-0 top-0 flex h-full w-full max-w-md transform flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ${
              open ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <header className="kt-header-glass flex items-start gap-3 px-4 py-4">
              <AppBackTab
                onBack={() => setOpen(false)}
                label="Back to transport"
                historyKey="transport-notifications"
                iconSize={30}
                className="mt-0.5 shrink-0 rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
                useHistoryLayer={false}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-wide text-green-700">
                  Transport Alerts
                </p>
                <h2 className="mt-1 truncate text-xl font-black text-slate-950">
                  Notifications
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Passenger trip updates and operator fleet alerts.
                </p>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
              {error ? (
                <NotificationState title="Unable to load alerts" body={error} />
              ) : loading ? (
                <NotificationState title="Loading notifications" body="Checking transport trips and operator alerts." />
              ) : notifications.length === 0 ? (
                <NotificationState title="No notifications" body="Ride, delivery, and operator alerts will appear here." />
              ) : (
                <div className="space-y-3">
                  {notifications.map((notification) => (
                    <article
                      key={notification.id}
                      className={`rounded-2xl border p-3 ${
                        notification.unread
                          ? "border-green-100 bg-green-50"
                          : "border-slate-100 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-green-700 shadow-sm">
                          <Truck size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-sm font-black text-slate-950">{notification.title}</h3>
                            {notification.unread ? (
                              <span className="shrink-0 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-black text-white">
                                New
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm font-semibold text-slate-600">{notification.body}</p>
                          {notification.meta ? (
                            <p className="mt-1 text-xs font-bold text-slate-400">{notification.meta}</p>
                          ) : null}

                          {notification.fleetId ? (
                            <button
                              type="button"
                              onClick={() => {
                                setOpen(false);
                                onViewFleet?.(notification.fleetId);
                              }}
                              className="kt-touchable mt-3 text-sm font-black text-green-700 hover:text-green-800"
                            >
                              View fleet
                            </button>
                          ) : null}
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

function getTransportToastMessage(notification, companyAccount, operatorAccount) {
  if (/operator arrived/i.test(`${notification?.title || ""} ${notification?.body || ""}`)) {
    return "Your operator has arrived at the pickup point. Open Transport to review the trip.";
  }
  if (notification?.type === "company_booking" || (companyAccount?.access?.isOwner && !operatorAccount?.id)) {
    return "A company operator has received a booking request. Open Fleet HQ to review the assignment and status.";
  }
  if (notification?.type === "operator" && operatorAccount?.id) {
    return "You have a pending booking request. Open Transport notifications to review and respond.";
  }
  return "Your transport activity has a new update. Open Transport notifications to review it.";
}

function NotificationState({ title, body }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 text-center">
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      <p className="mt-1 text-sm font-semibold text-slate-500">{body}</p>
    </div>
  );
}
