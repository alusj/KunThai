import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BadgeCheck,
  BellRing,
  CarFront,
  ChartNoAxesCombined,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Compass,
  Copy,
  ExternalLink,
  EyeOff,
  Inbox,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MoreHorizontal,
  RotateCcw,
  Search,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserCog,
  Users,
  X,
} from "lucide-react";
import supabase from "../../Backend/lib/supabaseClient";
import { ADMIN_NAV_GROUPS, canAccess, formatRelativeTime } from "../adminConfig";
import {
  ADMIN_ACTIVITY_REFRESH_EVENT,
  getAdminActivityNotifications,
  markAdminActivityNotificationsRead,
  subscribeToAdminActivityNotifications,
  undoAdminActivityAction,
  updateAdminActivityNotification,
} from "../adminService";

const ICONS = {
  BadgeCheck,
  BellRing,
  CarFront,
  ChartNoAxesCombined,
  Compass,
  Inbox,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  Settings,
  ShieldAlert,
  Store,
  UserCog,
  Users,
};

const ACTIVITY_STATUS_META = {
  undo_requested: { label: "Undo requested", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  undone: { label: "Undone", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  dismissed: { label: "Dismissed", className: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
};

function getActivityStatus(item = {}) {
  return item.metadata?.undoStatus || item.action_status || "active";
}

function cleanNotificationUpdate(update = {}) {
  return Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
}

function roleKey(role = {}) {
  return role.role_key || role.key || "";
}

function activityMenuButtonClass(danger = false) {
  return `flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${danger ? "text-red-700 hover:bg-red-50" : "text-zinc-700 hover:bg-zinc-100"}`;
}

export default function AdminShell({ access, user, page, setPage, children, caseCount = 0, onActivity, onSearch }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityActionOpen, setActivityActionOpen] = useState("");
  const [activityActionBusy, setActivityActionBusy] = useState("");
  const [activityUndoDraft, setActivityUndoDraft] = useState(null);
  const [activity, setActivity] = useState([]);
  const [activityError, setActivityError] = useState("");
  const [activityNotice, setActivityNotice] = useState("");
  const [search, setSearch] = useState("");
  const role = access.roles?.[0];
  const chiefOrSuper = useMemo(() => Number(access.authorityLevel || 0) >= 5 || access.roles?.some((entry) => ["super_admin", "chief_admin"].includes(roleKey(entry))), [access]);
  const visibleGroups = useMemo(() => ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccess(access, item.permission, item.sector)),
  })).filter((group) => group.items.length), [access]);
  const unreadActivity = activity.filter((item) => !item.read_at).length;

  const loadActivity = useCallback(() => {
    setActivityError("");
    setActivityNotice("");
    setActivityUndoDraft(null);
    getAdminActivityNotifications(20)
      .then(setActivity)
      .catch((error) => setActivityError(error.message || "Unable to load activity."));
  }, []);

  useEffect(() => {
    loadActivity();
    return subscribeToAdminActivityNotifications(user?.id, (notification, eventType) => {
      if (notification?.archived_at) {
        setActivity((current) => current.filter((item) => item.id !== notification.id));
        return;
      }
      setActivity((current) => {
        const exists = current.some((item) => item.id === notification.id);
        if (eventType === "UPDATE" && exists) return current.map((item) => item.id === notification.id ? { ...item, ...notification } : item);
        return [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 20);
      });
      onActivity?.(notification);
    });
  }, [loadActivity, onActivity, user?.id]);

  useEffect(() => {
    window.addEventListener(ADMIN_ACTIVITY_REFRESH_EVENT, loadActivity);
    return () => window.removeEventListener(ADMIN_ACTIVITY_REFRESH_EVENT, loadActivity);
  }, [loadActivity]);

  function activityQueuePage(item = {}) {
    const queue = item.metadata?.queue;
    return ["reports", "support", "verification", "finance"].includes(queue) ? queue : "my-work";
  }

  function canOpenActivityAudit(item = {}) {
    return Boolean(item.audit_log_id && canAccess(access, "audit.view"));
  }

  function isActorActivity(item = {}) {
    return Boolean(item.metadata?.selfAction || (item.actor_user_id && user?.id && item.actor_user_id === user.id));
  }

  function canUndoActivity(item = {}) {
    const status = getActivityStatus(item);
    return item.notification_type === "admin_action"
      && Boolean(item.audit_log_id)
      && isActorActivity(item)
      && !["undo_requested", "undone"].includes(status);
  }

  async function markActivityReadLocal(item) {
    if (item.read_at) return;
    await markAdminActivityNotificationsRead([item.id]);
    const readAt = new Date().toISOString();
    setActivity((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: readAt } : entry));
  }

  async function copyActivityText(text, message) {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard is not available in this browser.");
    await navigator.clipboard.writeText(text);
    setActivityNotice(message);
  }

  function applyUndoResult(item, reason, result) {
    const nextStatus = result?.status === "undone" ? "undone" : "undo_requested";
    const now = new Date().toISOString();
    setActivity((current) => current.map((entry) => {
      const sameAudit = item.audit_log_id && entry.audit_log_id === item.audit_log_id;
      if (!sameAudit && entry.id !== item.id) return entry;
      return {
        ...entry,
        action_status: nextStatus,
        action_note: reason || entry.action_note,
        metadata: {
          ...(entry.metadata || {}),
          undoStatus: nextStatus,
          undoReason: reason || "",
          undoRequestedAt: now,
          undoRequestedBy: user?.id || null,
        },
      };
    }));
    setActivityNotice(result?.message || (nextStatus === "undone" ? "Action undone." : "Undo request recorded for review."));
  }

  async function submitActivityUndo() {
    const item = activityUndoDraft?.item;
    if (!item) return;
    const reason = activityUndoDraft.reason.trim();
    const busyKey = `${item.id}:undo`;
    setActivityActionBusy(busyKey);
    setActivityError("");
    setActivityNotice("");
    try {
      const result = await undoAdminActivityAction(item.id, reason);
      applyUndoResult(item, reason, result);
      setActivityUndoDraft(null);
    } catch (error) {
      setActivityError(error.message || "Unable to undo this action.");
    } finally {
      setActivityActionBusy((current) => current === busyKey ? "" : current);
    }
  }

  function navigate(nextPage) {
    setPage(nextPage);
    setMenuOpen(false);
    setActivityOpen(false);
    setActivityActionOpen("");
    setActivityUndoDraft(null);
  }

  async function openActivityItem(item) {
    setActivityActionOpen("");
    if (!item.read_at) {
      try {
        await markActivityReadLocal(item);
      } catch (error) {
        setActivityError(error.message || "Unable to mark this notification as read.");
      }
    }
    navigate(item.notification_type === "admin_action" && canOpenActivityAudit(item) ? "audit" : activityQueuePage(item));
  }

  async function handleActivityAction(event, item, action) {
    event.stopPropagation();
    const busyKey = `${item.id}:${action}`;
    setActivityActionBusy(busyKey);
    setActivityError("");
    setActivityNotice("");
    try {
      if (action === "open") {
        await openActivityItem(item);
        return;
      }

      if (action === "audit") {
        await markActivityReadLocal(item);
        navigate("audit");
        return;
      }

      if (action === "case") {
        await markActivityReadLocal(item);
        navigate(activityQueuePage(item));
        return;
      }

      if (action === "copy") {
        const details = [
          item.title,
          item.body,
          item.action_key ? `Action: ${item.action_key}` : "",
          item.sector ? `Sector: ${item.sector}` : "",
          item.audit_log_id ? `Audit ID: ${item.audit_log_id}` : "",
          item.case_id ? `Case ID: ${item.case_id}` : "",
        ].filter(Boolean).join("\n");
        await copyActivityText(details, "Notification details copied.");
        setActivityActionOpen("");
        return;
      }

      if (action === "copy-audit") {
        await copyActivityText(item.audit_log_id || "", "Audit ID copied.");
        setActivityActionOpen("");
        return;
      }

      if (action === "read" || action === "unread" || action === "archive") {
        const nextAction = action === "archive" ? "archive" : action;
        const updated = cleanNotificationUpdate(await updateAdminActivityNotification(item.id, nextAction));
        if (action === "archive") {
          setActivity((current) => current.filter((entry) => entry.id !== item.id));
          setActivityNotice("Notification dismissed.");
        } else {
          setActivity((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...updated } : entry));
        }
        setActivityActionOpen("");
        return;
      }

      if (action === "undo") {
        if (!canUndoActivity(item)) throw new Error("Only the admin who performed this action can undo it.");
        setActivityUndoDraft({ item, reason: "" });
        setActivityActionOpen("");
      }
    } catch (error) {
      setActivityError(error.message || "Unable to complete this notification action.");
    } finally {
      setActivityActionBusy((current) => current === busyKey ? "" : current);
    }
  }

  async function markAllActivityRead() {
    try {
      setActivityError("");
      setActivityNotice("");
      await markAdminActivityNotificationsRead();
      const readAt = new Date().toISOString();
      setActivity((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
    } catch (error) {
      setActivityError(error.message || "Unable to mark notifications as read.");
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    onSearch(search.trim());
  }

  const undoBusy = activityUndoDraft?.item ? activityActionBusy === `${activityUndoDraft.item.id}:undo` : false;

  const sidebar = (
    <div className="flex h-full flex-col bg-zinc-950 text-white">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
        <button type="button" onClick={() => navigate("overview")} className="flex items-center gap-3 text-left">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500 text-zinc-950">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-black">KunThai Admin</span>
            <span className="block text-[11px] font-semibold text-zinc-500">Operations workspace</span>
          </span>
        </button>
        <button type="button" title="Close navigation" onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white lg:hidden">
          <X size={19} />
        </button>
      </div>

      <nav className="kuntai-scrollbar-none flex-1 overflow-y-auto px-3 py-4">
        {visibleGroups.map((group) => (
          <section key={group.label} className="mb-5">
            <p className="mb-2 px-2 text-[10px] font-black uppercase text-zinc-500">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = page === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    className={`flex h-10 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm font-bold transition ${active ? "bg-white text-zinc-950" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.id === "my-work" && caseCount > 0 ? (
                      <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black ${active ? "bg-emerald-100 text-emerald-800" : "bg-zinc-800 text-zinc-300"}`}>{caseCount}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="border-t border-zinc-800 p-3">
        <div className="rounded-lg bg-zinc-900 p-3">
          <p className="truncate text-xs font-black text-white">{role?.name || "Administrator"}</p>
          <p className="mt-1 text-[11px] font-semibold text-zinc-500">Authority level {access.authorityLevel || 1}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-zinc-950/45" />
          <aside className="relative h-full w-[min(18rem,88vw)] shadow-xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white px-3 sm:px-5">
          <button type="button" title="Open navigation" onClick={() => setMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100 lg:hidden">
            <Menu size={21} />
          </button>

          <form onSubmit={submitSearch} className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search cases or users"
              className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-10 pr-3 text-sm font-semibold text-zinc-900 outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            />
          </form>

          <div className="relative">
            <button type="button" title="Admin activity" aria-expanded={activityOpen} onClick={() => { setActivityOpen((value) => !value); setProfileOpen(false); setActivityActionOpen(""); setActivityUndoDraft(null); }} className="relative grid h-10 w-10 shrink-0 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950">
              <BellRing size={18} />
              {unreadActivity ? <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1 py-0.5 text-center text-[9px] font-black leading-4 text-white">{unreadActivity > 99 ? "99+" : unreadActivity}</span> : null}
            </button>
            {activityOpen ? (
              <section className="absolute right-0 top-12 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
                <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
                  <div><p className="text-sm font-black text-zinc-950">Admin activity</p><p className="mt-0.5 text-[11px] font-semibold text-zinc-500">{unreadActivity ? `${unreadActivity} unread` : "You're up to date"}</p></div>
                  {unreadActivity ? <button type="button" onClick={markAllActivityRead} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"><CheckCheck size={15} /> Read all</button> : null}
                </header>
                {activityUndoDraft?.item ? (
                  <section className="border-b border-amber-100 bg-amber-50 px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white text-amber-700 ring-1 ring-amber-200">
                        <RotateCcw size={15} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-black text-amber-950">Undo admin action</p>
                          <button type="button" disabled={undoBusy} onClick={() => setActivityUndoDraft(null)} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                            <X size={14} aria-hidden="true" />
                          </button>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-4 text-amber-800">{activityUndoDraft.item.title}</p>
                        <p className="mt-1 text-[11px] font-semibold leading-4 text-amber-800">Case claim/status changes reverse immediately. Other action types are sent for Chief/Super Admin review.</p>
                        <textarea
                          value={activityUndoDraft.reason}
                          onChange={(event) => setActivityUndoDraft((current) => current ? { ...current, reason: event.target.value } : current)}
                          rows={2}
                          maxLength={240}
                          placeholder="Reason for undo"
                          className="mt-2 w-full resize-none rounded-md border border-amber-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button type="button" disabled={undoBusy} onClick={() => setActivityUndoDraft(null)} className="h-8 rounded-md px-2.5 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-50">Cancel</button>
                          <button type="button" disabled={undoBusy} onClick={submitActivityUndo} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-700 px-3 text-xs font-black text-white hover:bg-amber-800 disabled:opacity-60">
                            <RotateCcw size={14} aria-hidden="true" /> {undoBusy ? "Undoing..." : "Confirm undo"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}
                <div className="max-h-[26rem] overflow-y-auto">
                  {activity.map((item) => {
                    const status = getActivityStatus(item);
                    const statusMeta = ACTIVITY_STATUS_META[status];
                    const menuBusy = activityActionBusy.startsWith(`${item.id}:`);
                    const undoAllowed = canUndoActivity(item);
                    const auditAllowed = canOpenActivityAudit(item);
                    return (
                      <article key={item.id} className={`relative flex border-b border-zinc-100 last:border-0 ${item.read_at ? "bg-white" : "bg-emerald-50/55"}`}>
                        <button type="button" onClick={() => openActivityItem(item)} className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50">
                          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-zinc-200" : "bg-emerald-600"}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-black text-zinc-900">{item.title}</span>
                            <span className="mt-1 line-clamp-2 block text-[11px] font-medium leading-4 text-zinc-600">{item.body}</span>
                            <span className="mt-1.5 flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-bold text-zinc-400">{formatRelativeTime(item.created_at)}</span>
                              {statusMeta ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${statusMeta.className}`}>{statusMeta.label}</span> : null}
                            </span>
                          </span>
                        </button>
                        <div className="relative mr-2 mt-2 shrink-0">
                          <button
                            type="button"
                            aria-label="Open notification actions"
                            aria-expanded={activityActionOpen === item.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActivityError("");
                              setActivityNotice("");
                              setActivityActionOpen((current) => current === item.id ? "" : item.id);
                            }}
                            className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
                          >
                            <MoreHorizontal size={17} aria-hidden="true" />
                          </button>
                          {activityActionOpen === item.id ? (
                            <div className="absolute right-0 top-9 z-20 w-56 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-xl">
                              <button type="button" disabled={menuBusy} onClick={(event) => handleActivityAction(event, item, "open")} className={activityMenuButtonClass()}>
                                <ExternalLink size={15} aria-hidden="true" /> Open notification
                              </button>
                              {undoAllowed ? (
                                <button type="button" disabled={menuBusy} onClick={(event) => handleActivityAction(event, item, "undo")} className={activityMenuButtonClass(true)}>
                                  <RotateCcw size={15} aria-hidden="true" /> Undo action
                                </button>
                              ) : null}
                              {auditAllowed ? (
                                <button type="button" disabled={menuBusy} onClick={(event) => handleActivityAction(event, item, "audit")} className={activityMenuButtonClass()}>
                                  <Shield size={15} aria-hidden="true" /> {chiefOrSuper ? "Review in audit log" : "Open audit log"}
                                </button>
                              ) : null}
                              {item.case_id ? (
                                <button type="button" disabled={menuBusy} onClick={(event) => handleActivityAction(event, item, "case")} className={activityMenuButtonClass()}>
                                  <ExternalLink size={15} aria-hidden="true" /> Open related case
                                </button>
                              ) : null}
                              <div className="my-1 border-t border-zinc-100" />
                              {item.read_at ? (
                                <button type="button" disabled={menuBusy} onClick={(event) => handleActivityAction(event, item, "unread")} className={activityMenuButtonClass()}>
                                  <EyeOff size={15} aria-hidden="true" /> Mark unread
                                </button>
                              ) : (
                                <button type="button" disabled={menuBusy} onClick={(event) => handleActivityAction(event, item, "read")} className={activityMenuButtonClass()}>
                                  <CheckCircle2 size={15} aria-hidden="true" /> Mark read
                                </button>
                              )}
                              <button type="button" disabled={menuBusy} onClick={(event) => handleActivityAction(event, item, "copy")} className={activityMenuButtonClass()}>
                                <Copy size={15} aria-hidden="true" /> Copy details
                              </button>
                              {chiefOrSuper && item.audit_log_id ? (
                                <button type="button" disabled={menuBusy} onClick={(event) => handleActivityAction(event, item, "copy-audit")} className={activityMenuButtonClass()}>
                                  <ScrollText size={15} aria-hidden="true" /> Copy audit ID
                                </button>
                              ) : null}
                              <button type="button" disabled={menuBusy} onClick={(event) => handleActivityAction(event, item, "archive")} className={activityMenuButtonClass()}>
                                <Archive size={15} aria-hidden="true" /> Dismiss
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                  {!activity.length ? <div className="px-5 py-10 text-center text-xs font-semibold text-zinc-500">No admin activity notifications yet.</div> : null}
                </div>
                {activityNotice ? <p className="border-t border-emerald-100 bg-emerald-50 px-4 py-2 text-[11px] font-bold text-emerald-800">{activityNotice}</p> : null}
                {activityError ? <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-[11px] font-bold text-red-700">{activityError}</p> : null}
                <footer className="grid grid-cols-2 gap-2 border-t border-zinc-100 p-2">
                  {canAccess(access, "audit.view") ? <button type="button" onClick={() => navigate("audit")} className="h-9 rounded-md text-xs font-black text-zinc-700 hover:bg-zinc-100">Open audit log</button> : <span />}
                  {canAccess(access, "notifications.view") ? <button type="button" onClick={() => navigate("notifications")} className="h-9 rounded-md text-xs font-black text-zinc-700 hover:bg-zinc-100">Campaigns</button> : null}
                </footer>
              </section>
            ) : null}
          </div>

          <div className="relative">
            <button type="button" onClick={() => { setProfileOpen((value) => !value); setActivityOpen(false); setActivityActionOpen(""); setActivityUndoDraft(null); }} className="flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 text-left hover:bg-zinc-50">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-emerald-100 text-xs font-black text-emerald-800">
                {(user?.email || "A").slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden max-w-32 truncate text-xs font-black text-zinc-800 sm:block">{user?.email || "Chief Admin"}</span>
              <ChevronDown size={14} className="hidden text-zinc-400 sm:block" />
            </button>
            {profileOpen ? (
              <div className="absolute right-0 top-12 w-64 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg">
                <div className="border-b border-zinc-100 px-2 py-2">
                  <p className="truncate text-sm font-black text-zinc-900">{user?.email || "Chief Admin Preview"}</p>
                  <p className="mt-1 text-xs font-semibold text-zinc-500">{role?.name}</p>
                </div>
                <button type="button" onClick={() => supabase.auth.signOut()} className="mt-1 flex h-10 w-full items-center gap-2 rounded-md px-2 text-sm font-bold text-red-700 hover:bg-red-50">
                  <LogOut size={17} /> Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] p-3 sm:p-5 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
