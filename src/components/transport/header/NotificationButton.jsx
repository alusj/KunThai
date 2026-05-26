// NotificationButton.jsx
// Displays operator or passenger transport notifications.

import { useEffect, useMemo, useState } from "react";
import { Bell, Truck } from "lucide-react";

import AppBackTab from "../../shared/AppBackTab.jsx";
import AppPortal from "../../shared/AppPortal";
import { PremiumHeaderButton } from "../../shared/PremiumHeader";
import { fetchTransportNotifications } from "../../services/transportHeaderService";

export default function NotificationButton({ operatorAccount, onOpenChange, onViewFleet }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.unread).length,
    [notifications],
  );

  useEffect(() => {
    if (!open) return undefined;

    let alive = true;
    setLoading(true);
    setError("");

    fetchTransportNotifications(operatorAccount)
      .then((items) => {
        if (alive) setNotifications(items);
      })
      .catch((err) => {
        if (alive) {
          setError(err.message || "Unable to load transport notifications.");
          setNotifications([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [open, operatorAccount]);

  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <PremiumHeaderButton
        badge={unreadCount}
        icon={Bell}
        label="Open transport notifications"
        onClick={() => setOpen(true)}
        title="Open transport notifications"
      />

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

function NotificationState({ title, body }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 text-center">
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      <p className="mt-1 text-sm font-semibold text-slate-500">{body}</p>
    </div>
  );
}
