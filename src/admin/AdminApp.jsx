import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Database, Globe2, LoaderCircle, ShieldOff, Wrench } from "lucide-react";
import { useAuth } from "../Backend/hooks/useAuth";
import supabase from "../Backend/lib/supabaseClient";
import AdminLogin from "./AdminLogin";
import AdminMfaGate from "./AdminMfaGate";
import { ADMIN_NAV_GROUPS, canAccess } from "./adminConfig";
import { enableAdminPreview, getAdminAccess, getAdminCases, getCaseSearchText, getCountryOptions, getDashboardSummary, isAdminPreview, matchesCaseCountry } from "./adminService";
import { inlineErrorMessage } from "../Backend/services/friendlyErrorService";
import AdminShell from "./components/AdminShell";
import CaseDrawer from "./components/CaseDrawer";
import AiAssistantHost from "../components/ai/AiAssistantHost";
import AiFloatingButton from "../components/ai/AiFloatingButton";
import { setAiRole, setAiSurface } from "../Backend/services/ai/aiSurfaceService";
import { registerAdminAiTools } from "./adminAiTools";
import ActionHistoryView from "./views/ActionHistoryView";
import UsersView from "./views/UsersView";
import UrMallMessageSupervisionView from "./views/UrMallMessageSupervisionView";
import JoinKunThaiView from "./views/JoinKunThaiView";
import DirectoryView from "./views/DirectoryView";
import StaffView from "./views/StaffView";
import AuditLogView from "./views/AuditLogView";
import PlatformPulse from "./components/ops/PlatformPulse";
import { touchAdminPresence } from "./operationsService";
import {
  AnalyticsView,
  FinanceView,
  NotificationsView,
  OverviewView,
  QueueView,
  SectorView,
  SettingsView,
} from "./views/AdminViews";
import { t as i18nText } from "../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../i18n/index.js";

function LoadingScreen({ message = "Opening the admin workspace…" }) {
  useUiLocale();
  return <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-5"><div className="flex items-center gap-3 text-sm font-bold text-zinc-600"><LoaderCircle className="animate-spin text-emerald-700" size={20} />{translateUi(message)}</div></main>;
}

function AdminSetupRequired({ error }) {
  useUiLocale();
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-5">
      <section className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-amber-50 text-amber-700"><Database size={22} /></span>
        <h1 className="mt-5 text-2xl font-black text-zinc-950">{i18nText("ui.literals.k1e6e72a232ae")}</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-zinc-600">{i18nText("ui.literals.k748e69602d6f")}</p>
        {error ? <p className="mt-4 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-600">{translateUi(error)}</p> : null}
        {import.meta.env.DEV ? <button type="button" onClick={() => { enableAdminPreview(); window.location.reload(); }} className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800"><Wrench size={17} /> {i18nText("ui.literals.k69a1fd04c38f")}</button> : null}
      </section>
    </main>
  );
}

function AccessDenied({ user }) {
  useUiLocale();
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-5">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-red-50 text-red-700"><ShieldOff size={24} /></span>
        <h1 className="mt-5 text-2xl font-black text-zinc-950">{i18nText("ui.literals.k259b14481d9f")}</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-zinc-600">{user?.email || i18nText("ui.literals.kbbbf83c4baef")} {i18nText("ui.literals.k51b5c3775398")}</p>
        <div className="mt-6 grid gap-2">
          <a href="/" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800"><ArrowLeft size={17} /> {i18nText("ui.literals.k954a66898c26")}</a>
          <button type="button" onClick={() => supabase.auth.signOut({ scope: "local" })} className="h-11 rounded-lg border border-zinc-300 px-4 text-sm font-black text-zinc-700 hover:bg-zinc-50">{i18nText("ui.literals.kc99bf1aa64be")}</button>
          {import.meta.env.DEV ? <button type="button" onClick={() => { enableAdminPreview(); window.location.reload(); }} className="h-11 rounded-lg border border-emerald-300 px-4 text-sm font-black text-emerald-800 hover:bg-emerald-50">{i18nText("ui.literals.k69a1fd04c38f")}</button> : null}
        </div>
      </section>
    </main>
  );
}

// The hash may carry filters (#/urmall-businesses?status=suspended); the page
// is everything before the query.
function initialPage() {
  const page = window.location.hash.replace(/^#\/?/, "").split("?")[0];
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
  useUiLocale();
  return (
    <section className="mb-5 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Globe2 size={19} /></span>
        <div className="min-w-0">
          <p className="text-sm font-black text-zinc-950">{i18nText("ui.literals.kf7be67ca6c35")}</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">{visibleCases} {i18nText("ui.literals.kde04fa0e29f9")} {totalCases} {i18nText("ui.literals.kbcc1c6d3f1f3")}</p>
        </div>
      </div>
      <label className="min-w-56">
        <span className="sr-only">{i18nText("ui.literals.kc6f1aee71ec5")}</span>
        <select value={countryFilter} onChange={(event) => onCountryFilterChange(event.target.value)} className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-black text-zinc-800 outline-none focus:border-emerald-600 focus:bg-white">
          {countryOptions.map((option) => <option key={option.value} value={option.value}>{translateUi(option.label)}</option>)}
        </select>
      </label>
    </section>
  );
}

function AdminWorkspace({ access, user, preview }) {
  useUiLocale();
  const [requestedPage, setPageState] = useState(initialPage);
  const [summary, setSummary] = useState({ openCases: 0, urgentCases: 0, unassignedCases: 0, overdueCases: 0, resolvedToday: 0, bySector: {}, byQueue: {} });
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  // Bumped on every in-app navigation so directory screens re-read filters
  // from the URL (e.g. a dashboard tile linking to suspended businesses).
  const [navKey, setNavKey] = useState(0);

  const visiblePages = useMemo(() => new Set(ADMIN_NAV_GROUPS.flatMap((group) => group.items).filter((item) => canAccess(access, item.permission, item.sector)).map((item) => item.id)), [access]);

  // KAI in the admin workspace: admin-only tools, admin context. The
  // server independently re-checks admin access on every AI request.
  useEffect(() => {
    registerAdminAiTools();
    setAiSurface({ surface: "admin", screen: "admin workspace" });
    setAiRole("admin", "admin", "admin workspace");
  }, []);
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
      setError(inlineErrorMessage(nextError, "Unable to load the admin workspace."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleAdminActivity = useCallback((notification) => {
    if (notification?.notification_type === "case_intake") refresh(true);
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { touchAdminPresence(); }, []);

  useEffect(() => {
    function syncPage() { setPageState(initialPage()); }
    window.addEventListener("hashchange", syncPage);
    return () => window.removeEventListener("hashchange", syncPage);
  }, []);

  function setPage(nextPage, query = "") {
    if (!visiblePages.has(nextPage)) return;
    setPageState(nextPage);
    setNavKey((current) => current + 1);
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#/${nextPage}${query}`);
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

  if (loading) return <LoadingScreen message={i18nText("ui.literals.k02fc6db0216b")} />;

  let content;
  if (page === "overview") content = <OverviewView pulse={<PlatformPulse canOpen={(id) => visiblePages.has(id)} onOpen={setPage} />} summary={visibleSummary} cases={countryCases} onOpenCase={setSelectedCase} onNavigate={setPage} refreshing={refreshing} onRefresh={() => refresh(true)} />;
  else if (page === "my-work") content = <QueueView title={globalSearch ? i18nText("ui.literals.kc7e7e82fe077", { value0: globalSearch }) : i18nText("ui.literals.k57a125343d6e")} description={globalSearch ? i18nText("ui.literals.k2d6c8f04b6bd") : i18nText("ui.literals.k2d21261b5279")} cases={searchedCases} onOpenCase={setSelectedCase} />;
  else if (page === "users") content = <UsersView access={access} />;
  else if (page === "urmall-businesses") content = <DirectoryView key={`biz-${navKey}`} pageId={page} targetType="marketplace_business" access={access} />;
  else if (page === "urride-operators") content = <DirectoryView key={`op-${navKey}`} pageId={page} targetType="transport_operator" access={access} />;
  else if (page === "urride-companies") content = <DirectoryView key={`co-${navKey}`} pageId={page} targetType="transport_company" access={access} />;
  else if (["explore", "marketplace", "transport"].includes(page)) content = <SectorView sector={page} cases={countryCases} onOpenCase={setSelectedCase} />;
  else if (page === "verification") content = <QueueView title={i18nText("ui.literals.k03128bed9062")} description={i18nText("ui.literals.k549d652bdd02")} cases={countryCases} defaultQueue="verification" onOpenCase={setSelectedCase} />;
  else if (page === "reports") content = <QueueView title={i18nText("ui.literals.k6d18054c6543")} description={i18nText("ui.literals.ke6c9a95abd64")} cases={countryCases} defaultQueue="reports" onOpenCase={setSelectedCase} />;
  else if (page === "support") content = <QueueView title={i18nText("ui.literals.k70a2200e7210")} description={i18nText("ui.literals.k6c4075669e51")} cases={countryCases} defaultQueue="support" onOpenCase={setSelectedCase} />;
  else if (page === "message-supervision") content = <UrMallMessageSupervisionView />;
  else if (page === "join-kunthai") content = <JoinKunThaiView access={access} />;
  else if (page === "notifications") content = <NotificationsView access={access} />;
  else if (page === "finance") content = <FinanceView cases={countryCases} onOpenCase={setSelectedCase} />;
  else if (page === "analytics") content = <AnalyticsView summary={visibleSummary} cases={countryCases} />;
  else if (page === "team") content = <StaffView access={access} user={user} />;
  else if (page === "actions") content = <ActionHistoryView user={user} />;
  else if (page === "audit") content = <AuditLogView />;
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
      {preview ? <div className="mb-4 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800"><Wrench size={15} /> {i18nText("ui.literals.k5455a24271c7")}</div> : null}
      {error ? <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{translateUi(error)}</div> : null}
      <GlobalOperationsFilter countryFilter={countryFilter} countryOptions={countryOptions} onCountryFilterChange={setCountryFilter} totalCases={cases.length} visibleCases={countryCases.length} />
      {content}
      {selectedCase ? <CaseDrawer item={selectedCase} access={access} onClose={() => setSelectedCase(null)} onUpdated={updateCase} /> : null}
      {preview ? null : <AiAssistantHost />}
      {preview ? null : <AiFloatingButton />}
    </AdminShell>
  );
}

export default function AdminApp() {
  useUiLocale();
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
    getAdminAccess().then((value) => { if (active) setAccess(value); }).catch((error) => { if (active) setAccessError(inlineErrorMessage(error, "Admin access check failed.")); }).finally(() => { if (active) setAccessLoading(false); });
    return () => { active = false; };
  }, [authLoading, preview, user]);

  if (authLoading) return <LoadingScreen />;
  if (!user && !preview) return <AdminLogin />;
  if (accessLoading) return <LoadingScreen message={i18nText("ui.literals.kb2e314ba8568")} />;
  if (accessError) return <AdminSetupRequired error={accessError} />;
  if (!access?.isAdmin) return <AccessDenied user={user} />;

  const activeUser = user || { id: "preview-user", email: "chief@kunthai.preview" };
  return (
    <AdminMfaGate bypass={preview || access.requiresMfa === false}>
      <AdminWorkspace access={access} user={activeUser} preview={preview} />
    </AdminMfaGate>
  );
}
