import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  Compass,
  LoaderCircle,
  Settings2,
  ShieldAlert,
  ShoppingBag,
  Trash2,
  Truck,
  X,
} from "lucide-react";

import supabase from "../../Backend/lib/supabaseClient";
import {
  UNIFIED_NOTIFICATIONS_UPDATED_EVENT,
  fetchUnifiedNotificationPreferences,
  fetchUnifiedNotifications,
  markUnifiedNotificationsDisplayed,
  notificationAllowedByPreferences,
  notificationSourceLabel,
  openUnifiedNotification,
  saveUnifiedNotificationPreferences,
  updateUnifiedNotificationReceipt,
} from "../../Backend/services/unifiedNotificationService";
import { disablePushNotifications, enablePushNotifications } from "../../Backend/services/pushService";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";
import AppBackTab from "./AppBackTab";
import AppPortal from "./AppPortal";
import useBodyScrollLock from "./useBodyScrollLock";
import { t as i18nText } from "../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";

const REFRESH_MS = 30_000;
const TABS = [
  { id: "all", label: "All" },
  { id: "explore", label: "Explore" },
  { id: "marketplace", label: "UrMall" },
  { id: "transport", label: "UrRide" },
  { id: "system", label: "System" },
];

function relativeTime(value) {
  const milliseconds = Date.now() - new Date(value || 0).getTime();
  if (!Number.isFinite(milliseconds)) return "";
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function sourceIcon(source, category) {
  if (["safety", "security", "account"].includes(category)) return ShieldAlert;
  if (source === "explore") return Compass;
  if (source === "marketplace") return ShoppingBag;
  if (source === "transport") return Truck;
  return BellRing;
}

function toneClasses(item) {
  if (["urgent", "critical"].includes(item.priority)) return "border-rose-200 bg-rose-50/90 text-rose-700";
  if (item.source === "marketplace") return "border-emerald-200 bg-emerald-50/80 text-emerald-700";
  if (item.source === "transport") return "border-violet-200 bg-violet-50/80 text-violet-700";
  if (item.source === "explore") return "border-sky-200 bg-sky-50/80 text-sky-700";
  return "border-amber-200 bg-amber-50/80 text-amber-700";
}

function preferenceRows() {
  return [
    { key: "floating_enabled", label: i18nText("ui.literals.ke0ceab8e8e66"), detail: i18nText("ui.literals.k372ceadbfaa7") },
    { key: "push_enabled", label: i18nText("ui.literals.kc2980d4ab0a3"), detail: i18nText("ui.literals.k6ef0573f768f") },
    { key: "social_enabled", label: i18nText("ui.literals.k3d7f7c2bc3d1"), detail: i18nText("ui.literals.kc7051bb552ad") },
    { key: "commerce_enabled", label: i18nText("ui.literals.kc68a9a0d51ff"), detail: i18nText("ui.literals.k72031de60614") },
    { key: "transport_enabled", label: i18nText("ui.literals.k84b196d91543"), detail: i18nText("ui.literals.kbd7e2fe89726") },
    { key: "marketing_enabled", label: i18nText("ui.literals.kcfaf378f96ff"), detail: i18nText("ui.literals.k66a394272326") },
  ];
}

export default function UnifiedNotificationCenter({ onCountChange, onOpenChange, open, userId = "" }) {
  useUiLocale();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState(null);
  const [savingPreference, setSavingPreference] = useState("");
  const busyRef = useRef(false);
  const queuedRef = useRef(false);

  const visibleItems = useMemo(() => {
    const allowed = items.filter((item) => notificationAllowedByPreferences(item, preferences || undefined));
    if (activeTab === "all") return allowed;
    if (activeTab === "system") return allowed.filter((item) => item.source === "system");
    return allowed.filter((item) => item.source === activeTab);
  }, [activeTab, items, preferences]);
  const unreadCount = useMemo(
    () => items.filter((item) => !item.read && notificationAllowedByPreferences(item, preferences || undefined)).length,
    [items, preferences],
  );

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!userId) {
      setItems([]);
      return;
    }
    if (busyRef.current) {
      queuedRef.current = true;
      return;
    }
    busyRef.current = true;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const nextItems = await fetchUnifiedNotifications(userId);
      setItems(nextItems);
    } catch (nextError) {
      if (!quiet) setError(inlineErrorMessage(nextError, "Unable to load your notifications."));
    } finally {
      busyRef.current = false;
      if (!quiet) setLoading(false);
      if (queuedRef.current) {
        queuedRef.current = false;
        window.setTimeout(() => refresh({ quiet: true }), 0);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    fetchUnifiedNotificationPreferences(userId)
      .then((value) => { if (active) setPreferences(value); })
      .catch(() => {});
    refresh();
    return () => { active = false; };
  }, [refresh, userId]);

  useEffect(() => {
    onCountChange?.(unreadCount);
  }, [onCountChange, unreadCount]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    const handleOpenRequest = () => onOpenChange?.(true);
    window.addEventListener("kuntai-open-notification-center", handleOpenRequest);
    return () => window.removeEventListener("kuntai-open-notification-center", handleOpenRequest);
  }, [onOpenChange]);

  useEffect(() => {
    if (!userId) return undefined;
    const refreshQuietly = () => refresh({ quiet: true });
    const events = [
      UNIFIED_NOTIFICATIONS_UPDATED_EVENT,
      "marketplace-orders-updated",
      "marketplace-message-sent",
      "marketplace-seller-messages-updated",
      "marketplace-seller-notifications-updated",
      "transport-booking-created",
      "transport-trip-updated",
    ];
    events.forEach((eventName) => window.addEventListener(eventName, refreshQuietly));
    const interval = window.setInterval(refreshQuietly, REFRESH_MS);
    const channel = supabase
      .channel(`unified-notification-center-${userId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_notifications", filter: `user_id=eq.${userId}` }, refreshQuietly)
      .on("postgres_changes", { event: "*", schema: "public", table: "explore_notifications", filter: `user_id=eq.${userId}` }, refreshQuietly)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketplace_customer_messages" }, refreshQuietly)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketplace_orders" }, refreshQuietly)
      .on("postgres_changes", { event: "*", schema: "public", table: "transport_passenger_notifications", filter: `passenger_id=eq.${userId}` }, refreshQuietly)
      .on("postgres_changes", { event: "*", schema: "public", table: "transport_operator_alerts" }, refreshQuietly)
      .subscribe();
    return () => {
      window.clearInterval(interval);
      events.forEach((eventName) => window.removeEventListener(eventName, refreshQuietly));
      supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  useEffect(() => {
    if (!open || !items.length || !userId) return;
    markUnifiedNotificationsDisplayed(userId, items).catch(() => {});
  }, [items, open, userId]);

  useEffect(() => {
    if (!open) {
      setSettingsOpen(false);
      return undefined;
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") onOpenChange?.(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  useBodyScrollLock(open);

  async function markRead(item) {
    if (!item || item.read) return;
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, read: true, seen: true } : row));
    await updateUnifiedNotificationReceipt(userId, item, "read").catch(() => refresh({ quiet: true }));
  }

  function openItem(item) {
    if (!openUnifiedNotification(item)) return;
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, read: true, seen: true, actionedAt: new Date().toISOString() } : row));
    onOpenChange?.(false);
    updateUnifiedNotificationReceipt(userId, item, "actioned").catch(() => {});
  }

  async function dismissItem(item) {
    setItems((current) => current.filter((row) => row.id !== item.id));
    await updateUnifiedNotificationReceipt(userId, item, "dismissed").catch(() => refresh({ quiet: true }));
  }

  async function markAllRead() {
    const unread = items.filter((item) => !item.read);
    setItems((current) => current.map((item) => ({ ...item, read: true, seen: true })));
    await Promise.allSettled(unread.map((item) => updateUnifiedNotificationReceipt(userId, item, "read")));
  }

  async function togglePreference(key) {
    if (!preferences || savingPreference) return;
    setSavingPreference(key);
    try {
      let nextValue = preferences[key] === false;
      if (key === "push_enabled") {
        if (nextValue) await enablePushNotifications();
        else await disablePushNotifications();
      }
      const next = await saveUnifiedNotificationPreferences(userId, { ...preferences, [key]: nextValue });
      setPreferences(next);
    } catch (nextError) {
      setError(inlineErrorMessage(nextError, "Unable to update notification preferences."));
    } finally {
      setSavingPreference("");
    }
  }

  return (
    <AppPortal>
      <div
        aria-hidden={!open}
        inert={open ? undefined : "true"}
        className={`fixed inset-0 z-[1250] overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      >
        <button
          type="button"
          aria-label={i18nText("ui.literals.kf0252bf7d604")}
          onClick={() => onOpenChange?.(false)}
          tabIndex={open ? 0 : -1}
          className={`absolute inset-0 border-0 bg-slate-950/50 p-0 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        />

        <section
          role="dialog"
          aria-modal="true"
          aria-label={i18nText("ui.literals.ke87b717dc39b")}
          className={`absolute right-0 top-0 flex h-full w-full max-w-xl transform flex-col overflow-hidden bg-slate-50 shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        >
          <header className="kt-header-glass shrink-0 border-b border-slate-200 px-4 py-4">
            <div className="flex items-start gap-3">
              <AppBackTab
                onBack={() => onOpenChange?.(false)}
                label={i18nText("ui.literals.kda048102eef1")}
                historyKey="unified-notification-center"
                useHistoryLayer={false}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">KunThai</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{i18nText("ui.literals.k7d2c63d3bbad")}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{i18nText("ui.literals.kf08e01604ec0")}</p>
              </div>
              <button type="button" onClick={() => setSettingsOpen((value) => !value)} className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-600" aria-label={i18nText("ui.literals.kf512a17e0a63")}>
                {settingsOpen ? <X size={19} /> : <Settings2 size={19} />}
              </button>
            </div>

            {!settingsOpen ? (
              <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 kuntai-scrollbar-none">
                {TABS.map((tab) => {
                  const count = tab.id === "all"
                    ? items.length
                    : items.filter((item) => tab.id === "system" ? item.source === "system" : item.source === tab.id).length;
                  return (
                    <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`h-9 shrink-0 rounded-full px-3 text-xs font-black ${activeTab === tab.id ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
                      {translateUi(tab.label)}{count ? ` ${count}` : ""}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {settingsOpen ? (
              <section className="space-y-3">
                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <h3 className="font-black text-slate-950">{i18nText("ui.literals.k1c8773110c35")}</h3>
                  <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">{i18nText("ui.literals.kdd1cf3cc31f8")}</p>
                </div>
                {preferenceRows().map((row) => (
                  <button key={row.key} type="button" onClick={() => togglePreference(row.key)} disabled={!preferences || Boolean(savingPreference)} className="flex w-full items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 text-left disabled:opacity-60">
                    <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${preferences?.[row.key] !== false ? "bg-sky-600" : "bg-slate-300"}`}>
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${preferences?.[row.key] !== false ? "left-6" : "left-1"}`} />
                    </span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-black text-slate-950">{translateUi(row.label)}</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{translateUi(row.detail)}</span></span>
                    {savingPreference === row.key ? <LoaderCircle className="animate-spin text-sky-600" size={18} /> : null}
                  </button>
                ))}
              </section>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div><p className="text-sm font-black text-slate-950">{unreadCount ? i18nText("ui.literals.kae60f0c32038", { value0: unreadCount }) : i18nText("ui.literals.k6ba3be5eae5a")}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{i18nText("ui.literals.k83b2ec41dc15")}</p></div>
                  {unreadCount ? <button type="button" onClick={markAllRead} className="inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-xs font-black text-sky-700 ring-1 ring-slate-200"><CheckCheck size={16} /> {i18nText("ui.literals.k8958e22c23d1")}</button> : null}
                </div>

                {error ? <div role="alert" className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{translateUi(error)}</div> : null}
                {loading && !items.length ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="animate-spin text-sky-600" size={26} /></div> : null}
                {!loading && !visibleItems.length ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><Bell className="mx-auto text-slate-300" size={32} /><h3 className="mt-3 font-black text-slate-950">{i18nText("ui.literals.k1f2b39278ede")}</h3><p className="mt-1 text-sm font-semibold text-slate-500">{i18nText("ui.literals.kd0303c90012d")}</p></div>
                ) : null}

                <div className="space-y-3">
                  {visibleItems.map((item) => {
                    const Icon = sourceIcon(item.source, item.category);
                    return (
                      <article key={item.id} onClick={() => markRead(item)} className={`group rounded-3xl border p-4 shadow-sm transition ${item.read ? "border-slate-200 bg-white" : toneClasses(item)}`}>
                        <div className="flex items-start gap-3">
                          <span className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl ${item.read ? "bg-slate-100 text-slate-500" : "bg-white/85"}`}>
                            {item.avatarUrl ? <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" /> : <Icon size={19} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2"><h3 className="min-w-0 flex-1 text-sm font-black leading-5 text-slate-950">{item.campaignId || item.type === "admin_message" ? item.title : translateUi(item.title)}</h3>{!item.read ? <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" /> : null}</div>
                            {item.media?.url ? <img src={item.media.url} alt="" className="mt-3 max-h-44 w-full rounded-2xl object-cover" /> : null}
                            <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">{item.campaignId || item.type === "admin_message" ? item.body : translateUi(item.body)}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wide text-slate-400"><span>{notificationSourceLabel(item.source)}</span><span>•</span><span>{relativeTime(item.createdAt)}</span>{["urgent", "critical"].includes(item.priority) ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">{i18nText("ui.literals.kecb26f46e394")}</span> : null}</div>
                            <button type="button" onClick={(event) => { event.stopPropagation(); openItem(item); }} className="mt-3 inline-flex items-center gap-1 text-xs font-black text-sky-700">{item.actionLabel || i18nText("ui.literals.kcf9b77061f7b")} <ChevronRight size={15} /></button>
                          </div>
                          {item.canDismiss !== false ? <button type="button" onClick={(event) => { event.stopPropagation(); dismissItem(item); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-300 opacity-70 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100" aria-label={i18nText("ui.literals.kdc83cd803134")}><Trash2 size={16} /></button> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </AppPortal>
  );
}
