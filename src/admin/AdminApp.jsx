import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Database, Globe2, LoaderCircle, ShieldOff, Wrench } from "lucide-react";
import { useAuth } from "../Backend/hooks/useAuth";
import supabase from "../Backend/lib/supabaseClient";
import AdminLogin from "./AdminLogin";
import AdminMfaGate from "./AdminMfaGate";
import { ADMIN_NAV_GROUPS, canAccess } from "./adminConfig";
import { enableAdminPreview, getAdminAccess, getAdminCases, getCaseSearchText, getCountryOptions, getDashboardSummary, isAdminPreview, matchesCaseCountry } from "./adminService";
import AdminShell from "./components/AdminShell";
import CaseDrawer from "./components/CaseDrawer";
import ActionHistoryView from "./views/ActionHistoryView";
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
          <button type="button" onClick={() => supabase.auth.signOut({ scope: "local" })} className="h-11 rounded-lg border border-zinc-300 px-4 text-sm font-black text-zinc-700 hover:bg-zinc-50">Sign in with another account</button>
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

function buildCaseSummary(cases = [], fallback = {}) {
  const open = cases.filter((item) => !["resolved", "closed"].includes(item.status));
  return {
    ...fallback,
    openCases: open.length,
    urgentCases: open.filter((item) => ["urgent", "critical"].includes(item.priority)).length,
    unassignedCases: open.filter((item) => !item.assignee_user_id).length,
    overdueCases: open.filter((item) => item.sla_due_at && new Date(item.sla_due_at) < new Date()).length,
    bySector: Object.fromEntries(["explore", "marketplace", "transport"].map((sector) => [sector, open.filter((item) => item.sector === sector).length])),
    byQueue: Object.fromEntries(["verification", "reports", "support", "finance"].map((queue) => [queue, open.filter((item) => item.queue === queue).length])),
  };
}

function GlobalOperationsFilter({ countryFilter, countryOptions, onCountryFilterChange, totalCases, visibleCases }) {
  return (
    <section className="mb-5 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Globe2 size={19} /></span>
        <div className="min-w-0">
          <p className="text-sm font-black text-zinc-950">Global case scope</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">{visibleCases} of {totalCases} cases shown in this country scope.</p>
        </div>
      </div>
      <label className="min-w-56">
        <span className="sr-only">Country scope</span>
        <select value={countryFilter} onChange={(event) => onCountryFilterChange(event.target.value)} className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-black text-zinc-800 outline-none focus:border-emerald-600 focus:bg-white">
          {countryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </section>
  );
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
  const [countryFilter, setCountryFilter] = useState("all");

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

  const handleAdminActivity = useCallback((notification) => {
    if (notification?.notification_type === "case_intake") refresh(true);
  }, [refresh]);

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

  const countryCases = useMemo(() => cases.filter((item) => matchesCaseCountry(item, countryFilter)), [cases, countryFilter]);
  const countryOptions = useMemo(() => getCountryOptions(cases), [cases]);
  const searchedCases = globalSearch ? countryCases.filter((item) => getCaseSearchText(item).includes(globalSearch.toLowerCase())) : countryCases;
  const visibleSummary = useMemo(() => buildCaseSummary(countryCases, summary), [countryCases, summary]);

  if (loading) return <LoadingScreen message="Loading queues and permissions…" />;

  let content;
  if (page === "overview") content = <OverviewView summary={visibleSummary} cases={countryCases} onOpenCase={setSelectedCase} onNavigate={setPage} refreshing={refreshing} onRefresh={() => refresh(true)} />;
  else if (page === "my-work") content = <QueueView title={globalSearch ? `Search results for “${globalSearch}”` : "My work"} description={globalSearch ? "Matching cases across your permitted sectors." : "Cases assigned to you and unassigned cases available to claim."} cases={searchedCases} onOpenCase={setSelectedCase} />;
  else if (page === "users") content = <UsersView access={access} />;
  else if (["explore", "marketplace", "transport"].includes(page)) content = <SectorView sector={page} cases={countryCases} onOpenCase={setSelectedCase} />;
  else if (page === "verification") content = <QueueView title="Verification" description="Seller, operator, company, fleet, document, and profile review work." cases={countryCases} defaultQueue="verification" onOpenCase={setSelectedCase} />;
  else if (page === "reports") content = <QueueView title="Reports and safety" description="Content reports, fraud, safety incidents, and Area View validation." cases={countryCases} defaultQueue="reports" onOpenCase={setSelectedCase} />;
  else if (page === "support") content = <QueueView title="Support and disputes" description="My Voice, user, seller, order, trip, and operator support requiring administrative action." cases={countryCases} defaultQueue="support" onOpenCase={setSelectedCase} />;
  else if (page === "notifications") content = <NotificationsView access={access} />;
  else if (page === "finance") content = <FinanceView cases={countryCases} onOpenCase={setSelectedCase} />;
  else if (page === "analytics") content = <AnalyticsView summary={visibleSummary} cases={countryCases} />;
  else if (page === "team") content = <TeamView access={access} />;
  else if (page === "actions") content = <ActionHistoryView user={user} />;
  else if (page === "audit") content = <AuditView />;
  else if (page === "settings") content = <SettingsView access={access} />;

  return (
    <AdminShell
      access={access}
      user={user}
      page={page}
      setPage={setPage}
      caseCount={countryCases.filter((item) => !["resolved", "closed"].includes(item.status)).length}
      onActivity={handleAdminActivity}
      onSearch={(value) => { setGlobalSearch(value); setPage("my-work"); }}
    >
      {preview ? <div className="mb-4 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800"><Wrench size={15} /> Development preview. Production access still requires a database assignment and MFA.</div> : null}
      {error ? <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      <GlobalOperationsFilter countryFilter={countryFilter} countryOptions={countryOptions} onCountryFilterChange={setCountryFilter} totalCases={cases.length} visibleCases={countryCases.length} />
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
