import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BellRing,
  CarFront,
  ChartNoAxesCombined,
  CheckCheck,
  ChevronDown,
  Compass,
  Inbox,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  ScrollText,
  Settings,
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
  getAdminActivityNotifications,
  markAdminActivityNotificationsRead,
  subscribeToAdminActivityNotifications,
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

export default function AdminShell({ access, user, page, setPage, children, caseCount = 0, onActivity, onSearch }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activity, setActivity] = useState([]);
  const [activityError, setActivityError] = useState("");
  const [search, setSearch] = useState("");
  const role = access.roles?.[0];
  const visibleGroups = useMemo(() => ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccess(access, item.permission, item.sector)),
  })).filter((group) => group.items.length), [access]);
  const unreadActivity = activity.filter((item) => !item.read_at).length;

  const loadActivity = useCallback(() => {
    getAdminActivityNotifications(20)
      .then(setActivity)
      .catch((error) => setActivityError(error.message || "Unable to load activity."));
  }, []);

  useEffect(() => {
    loadActivity();
    return subscribeToAdminActivityNotifications(user?.id, (notification) => {
      setActivity((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 20));
      onActivity?.(notification);
    });
  }, [loadActivity, onActivity, user?.id]);

  function navigate(nextPage) {
    setPage(nextPage);
    setMenuOpen(false);
    setActivityOpen(false);
  }

  async function openActivityItem(item) {
    if (!item.read_at) {
      try {
        await markAdminActivityNotificationsRead([item.id]);
        setActivity((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
      } catch (error) {
        setActivityError(error.message || "Unable to mark this notification as read.");
      }
    }
    const queue = item.metadata?.queue;
    navigate(item.notification_type === "admin_action" ? "audit" : ["reports", "support", "verification", "finance"].includes(queue) ? queue : "my-work");
  }

  async function markAllActivityRead() {
    try {
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
            <button type="button" title="Admin activity" aria-expanded={activityOpen} onClick={() => { setActivityOpen((value) => !value); setProfileOpen(false); }} className="relative grid h-10 w-10 shrink-0 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950">
              <BellRing size={18} />
              {unreadActivity ? <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1 py-0.5 text-center text-[9px] font-black leading-4 text-white">{unreadActivity > 99 ? "99+" : unreadActivity}</span> : null}
            </button>
            {activityOpen ? (
              <section className="absolute right-0 top-12 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
                <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
                  <div><p className="text-sm font-black text-zinc-950">Admin activity</p><p className="mt-0.5 text-[11px] font-semibold text-zinc-500">{unreadActivity ? `${unreadActivity} unread` : "You're up to date"}</p></div>
                  {unreadActivity ? <button type="button" onClick={markAllActivityRead} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"><CheckCheck size={15} /> Read all</button> : null}
                </header>
                <div className="max-h-[26rem] overflow-y-auto">
                  {activity.map((item) => (
                    <button type="button" key={item.id} onClick={() => openActivityItem(item)} className={`block w-full border-b border-zinc-100 px-4 py-3 text-left last:border-0 hover:bg-zinc-50 ${item.read_at ? "bg-white" : "bg-emerald-50/55"}`}>
                      <span className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-zinc-200" : "bg-emerald-600"}`} /><span className="min-w-0 flex-1"><span className="block text-xs font-black text-zinc-900">{item.title}</span><span className="mt-1 line-clamp-2 block text-[11px] font-medium leading-4 text-zinc-600">{item.body}</span><span className="mt-1.5 block text-[10px] font-bold text-zinc-400">{formatRelativeTime(item.created_at)}</span></span></span>
                    </button>
                  ))}
                  {!activity.length ? <div className="px-5 py-10 text-center text-xs font-semibold text-zinc-500">No admin activity notifications yet.</div> : null}
                </div>
                {activityError ? <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-[11px] font-bold text-red-700">{activityError}</p> : null}
                <footer className="grid grid-cols-2 gap-2 border-t border-zinc-100 p-2">
                  {canAccess(access, "audit.view") ? <button type="button" onClick={() => navigate("audit")} className="h-9 rounded-md text-xs font-black text-zinc-700 hover:bg-zinc-100">Open audit log</button> : <span />}
                  {canAccess(access, "notifications.view") ? <button type="button" onClick={() => navigate("notifications")} className="h-9 rounded-md text-xs font-black text-zinc-700 hover:bg-zinc-100">Campaigns</button> : null}
                </footer>
              </section>
            ) : null}
          </div>

          <div className="relative">
            <button type="button" onClick={() => { setProfileOpen((value) => !value); setActivityOpen(false); }} className="flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 text-left hover:bg-zinc-50">
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
