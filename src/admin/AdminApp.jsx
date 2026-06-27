import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Database, LoaderCircle, ShieldOff, Wrench } from "lucide-react";
import { useAuth } from "../Backend/hooks/useAuth";
import supabase from "../Backend/lib/supabaseClient";
import AdminLogin from "./AdminLogin";
import AdminMfaGate from "./AdminMfaGate";
import { ADMIN_NAV_GROUPS, canAccess } from "./adminConfig";
import { enableAdminPreview, getAdminAccess, getAdminCases, getDashboardSummary, isAdminPreview } from "./adminService";
import AdminShell from "./components/AdminShell";
import CaseDrawer from "./components/CaseDrawer";
import {
  AnalyticsView,
  AuditView,
  FinanceView,
  NotificationsView,
  OverviewView,
  QueueView,
  SectorView,
  SettingsView,
  TeamView,
  UsersView,
} from "./views/AdminViews";

function LoadingScreen({ message = "Opening the admin workspace…" }) {
  return <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-5"><div className="flex items-center gap-3 text-sm font-bold text-zinc-600"><LoaderCircle className="animate-spin text-emerald-700" size={20} />{message}</div></main>;
}

function AdminSetupRequired({ error }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-5">
      <section className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-amber-50 text-amber-700"><Database size={22} /></span>
        <h1 className="mt-5 text-2xl font-black text-zinc-950">Admin database setup required</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-zinc-600">Apply the KunThai admin migration, then appoint the first Super Admin from the Supabase SQL editor. The application will remain locked until the backend permission check succeeds.</p>
        {error ? <p className="mt-4 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-600">{error}</p> : null}
        {import.meta.env.DEV ? <button type="button" onClick={() => { enableAdminPreview(); window.location.reload(); }} className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800"><Wrench size={17} /> Open Chief Admin preview</button> : null}
      </section>
    </main>
  );
}

function AccessDenied({ user }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-5">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-red-50 text-red-700"><ShieldOff size={24} /></span>
        <h1 className="mt-5 text-2xl font-black text-zinc-950">Admin access not assigned</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-zinc-600">{user?.email || "This account"} is signed in, but it has no active KunThai admin assignment.</p>
        <div className="mt-6 grid gap-2">
          <a href="/" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800"><ArrowLeft size={17} /> Return to KunThai</a>
          <button type="button" onClick={() => supabase.auth.signOut()} className="h-11 rounded-lg border border-zinc-300 px-4 text-sm font-black text-zinc-700 hover:bg-zinc-50">Sign in with another account</button>
          {import.meta.env.DEV ? <button type="button" onClick={() => { enableAdminPreview(); window.location.reload(); }} className="h-11 rounded-lg border border-emerald-300 px-4 text-sm font-black text-emerald-800 hover:bg-emerald-50">Open Chief Admin preview</button> : null}
        </div>
      </section>
    </main>
  );
}

function initialPage() {
  const page = window.location.hash.replace(/^#\/?/, "");
  return page || "overview";
}

function AdminWorkspace({ access, user, preview }) {
  const [requestedPage, setPageState] = useState(initialPage);
  const [summary, setSummary] = useState({ openCases: 0, urgentCases: 0, unassignedCases: 0, overdueCases: 0, resolvedToday: 0, bySector: {}, byQueue: {} });
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");

  const visiblePages = useMemo(() => new Set(ADMIN_NAV_GROUPS.flatMap((group) => group.items).filter((item) => canAccess(access, item.permission, item.sector)).map((item) => item.id)), [access]);
  const page = visiblePages.has(requestedPage) ? requestedPage : "overview";

  const refresh = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const [nextSummary, nextCases] = await Promise.all([getDashboardSummary(), getAdminCases({ limit: 250 })]);
      setSummary(nextSummary || {});
      setCases(nextCases || []);
      setSelectedCase((current) => current ? nextCases.find((item) => item.id === current.id) || current : null);
    } catch (nextError) {
      setError(nextError.message || "Unable to load the admin workspace.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    function syncPage() { setPageState(initialPage()); }
    window.addEventListener("hashchange", syncPage);
    return () => window.removeEventListener("hashchange", syncPage);
  }, []);

  function setPage(nextPage) {
    if (!visiblePages.has(nextPage)) return;
    setPageState(nextPage);
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#/${nextPage}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateCase(updated) {
    setCases((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    setSelectedCase((current) => current?.id === updated.id ? { ...current, ...updated } : current);
  }

  const searchedCases = globalSearch ? cases.filter((item) => `${item.case_number} ${item.title} ${item.description}`.toLowerCase().includes(globalSearch.toLowerCase())) : cases;

  if (loading) return <LoadingScreen message="Loading queues and permissions…" />;

  let content;
  if (page === "overview") content = <OverviewView summary={summary} cases={cases} onOpenCase={setSelectedCase} onNavigate={setPage} refreshing={refreshing} onRefresh={() => refresh(true)} />;
  else if (page === "my-work") content = <QueueView title={globalSearch ? `Search results for “${globalSearch}”` : "My work"} description={globalSearch ? "Matching cases across your permitted sectors." : "Cases assigned to you and unassigned cases available to claim."} cases={searchedCases} onOpenCase={setSelectedCase} />;
  else if (page === "users") content = <UsersView access={access} />;
  else if (["explore", "marketplace", "transport"].includes(page)) content = <SectorView sector={page} cases={cases} onOpenCase={setSelectedCase} />;
  else if (page === "verification") content = <QueueView title="Verification" description="Seller, operator, company, fleet, document, and profile review work." cases={cases} defaultQueue="verification" onOpenCase={setSelectedCase} />;
  else if (page === "reports") content = <QueueView title="Reports and safety" description="Content reports, fraud, safety incidents, and Area View validation." cases={cases} defaultQueue="reports" onOpenCase={setSelectedCase} />;
  else if (page === "support") content = <QueueView title="Support and disputes" description="User, seller, order, trip, and operator support requiring administrative action." cases={cases} defaultQueue="support" onOpenCase={setSelectedCase} />;
  else if (page === "notifications") content = <NotificationsView access={access} />;
  else if (page === "finance") content = <FinanceView cases={cases} onOpenCase={setSelectedCase} />;
  else if (page === "analytics") content = <AnalyticsView summary={summary} cases={cases} />;
  else if (page === "team") content = <TeamView access={access} />;
  else if (page === "audit") content = <AuditView />;
  else if (page === "settings") content = <SettingsView access={access} />;

  return (
    <AdminShell
      access={access}
      user={user}
      page={page}
      setPage={setPage}
      caseCount={cases.filter((item) => !["resolved", "closed"].includes(item.status)).length}
      onSearch={(value) => { setGlobalSearch(value); setPage("my-work"); }}
    >
      {preview ? <div className="mb-4 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800"><Wrench size={15} /> Development preview. Production access still requires a database assignment and MFA.</div> : null}
      {error ? <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {content}
      {selectedCase ? <CaseDrawer item={selectedCase} access={access} onClose={() => setSelectedCase(null)} onUpdated={updateCase} /> : null}
    </AdminShell>
  );
}

export default function AdminApp() {
  const { user, loading: authLoading } = useAuth();
  const preview = isAdminPreview();
  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState("");

  useEffect(() => {
    if (authLoading || (!user && !preview)) {
      setAccessLoading(false);
      return;
    }
    let active = true;
    setAccessLoading(true);
    getAdminAccess().then((value) => { if (active) setAccess(value); }).catch((error) => { if (active) setAccessError(error.message || "Admin access check failed."); }).finally(() => { if (active) setAccessLoading(false); });
    return () => { active = false; };
  }, [authLoading, preview, user]);

  if (authLoading) return <LoadingScreen />;
  if (!user && !preview) return <AdminLogin />;
  if (accessLoading) return <LoadingScreen message="Verifying your admin assignment…" />;
  if (accessError) return <AdminSetupRequired error={accessError} />;
  if (!access?.isAdmin) return <AccessDenied user={user} />;

  const activeUser = user || { id: "preview-user", email: "chief@kunthai.preview" };
  return (
    <AdminMfaGate bypass={preview || access.requiresMfa === false}>
      <AdminWorkspace access={access} user={activeUser} preview={preview} />
    </AdminMfaGate>
  );
}
