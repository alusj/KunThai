import { useMemo, useState } from "react";
import {
  BadgeCheck,
  BellRing,
  CarFront,
  ChartNoAxesCombined,
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
import { ADMIN_NAV_GROUPS, canAccess } from "../adminConfig";

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

export default function AdminShell({ access, user, page, setPage, children, caseCount = 0, onSearch }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const role = access.roles?.[0];
  const visibleGroups = useMemo(() => ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccess(access, item.permission, item.sector)),
  })).filter((group) => group.items.length), [access]);

  function navigate(nextPage) {
    setPage(nextPage);
    setMenuOpen(false);
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

          <button type="button" title="Notification campaigns" onClick={() => navigate("notifications")} className="relative grid h-10 w-10 shrink-0 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950">
            <BellRing size={18} />
          </button>

          <div className="relative">
            <button type="button" onClick={() => setProfileOpen((value) => !value)} className="flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 text-left hover:bg-zinc-50">
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

