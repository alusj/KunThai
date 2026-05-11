// NotificationButton.jsx
// Displays operator or passenger transport notifications.

import { useEffect, useMemo, useState } from "react";
import { FiBell, FiTruck, FiX } from "react-icons/fi";

import { fetchTransportNotifications } from "../../services/transportHeaderService";

export default function NotificationButton({ operatorAccount, onViewFleet }) {
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open transport notifications"
        title="Open transport notifications"
        className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
      >
        <FiBell size={20} />

        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-[10px] font-black leading-4 text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/40 px-3 py-4 backdrop-blur-[2px]">
          <div className="mx-auto flex min-h-full w-full max-w-lg items-start justify-center pt-10">
            <section className="w-full overflow-hidden rounded-3xl bg-white shadow-2xl">
              <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-green-700">
                    Transport Alerts
                  </p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">
                    Notifications
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Passenger trip updates and operator fleet alerts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                  aria-label="Close transport notifications"
                >
                  <FiX size={18} />
                </button>
              </header>

              <div className="max-h-[70vh] overflow-y-auto p-4">
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
                            <FiTruck size={18} />
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
                                className="mt-3 text-sm font-black text-green-700 hover:text-green-800"
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
        </div>
      ) : null}
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
