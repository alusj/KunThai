import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BadgeCheck,
  BellRing,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileWarning,
  FlaskConical,
  LoaderCircle,
  LockKeyhole,
  MailPlus,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  UserMinus,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { ADMIN_RESPONSIBILITIES, ADMIN_ROLES, ADMIN_SECTORS, formatDateTime, titleCase } from "../adminConfig";
import { NOTIFICATION_MESSAGE_SUGGESTIONS, NOTIFICATION_TITLE_SUGGESTIONS } from "../adminTextSuggestions";
import {
  getCaseSearchText,
  getCaseTypeLabel,
  getAdminTeam,
  getAuditLog,
  getFeatureFlags,
  grantAdminAccess,
  revokeAdminAccess,
  updateFeatureFlag,
} from "../adminService";
import CaseTable from "../components/CaseTable";
import SuggestedTextSelect from "../components/SuggestedTextSelect";
import NotificationCampaignCenter from "../notifications/NotificationCampaignCenter";
import { t as i18nText } from "../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";

export { default as UsersView } from "./UsersView";

export function PageHeading({ eyebrow, title, description, action }) {
  useUiLocale();
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow ? <p className="text-xs font-black uppercase text-emerald-700">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-black text-zinc-950 sm:text-3xl">{translateUi(title)}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-zinc-600">{translateUi(description)}</p> : null}
      </div>
      {action}
    </header>
  );
}

function Metric({ label, value, detail, tone = "zinc", icon: Icon }) {
  useUiLocale();
  const tones = {
    zinc: "border-zinc-200 bg-white text-zinc-950",
    red: "border-red-200 bg-red-50 text-red-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    sky: "border-sky-200 bg-sky-50 text-sky-950",
  };
  return (
    <div className={`min-h-28 rounded-lg border p-4 ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-black uppercase opacity-65">{translateUi(label)}</p>
        {Icon ? <Icon size={18} className="opacity-60" /> : null}
      </div>
      <p className="mt-3 text-3xl font-black">{value ?? 0}</p>
      <p className="mt-1 text-xs font-semibold opacity-60">{translateUi(detail)}</p>
    </div>
  );
}

function QueueSummary({ cases }) {
  useUiLocale();
  const queues = [
    { key: "verification", label: i18nText("ui.literals.k03128bed9062"), color: "bg-emerald-500" },
    { key: "reports", label: i18nText("ui.literals.k6d18054c6543"), color: "bg-red-500" },
    { key: "support", label: i18nText("ui.literals.kf32d5a3b17e6"), color: "bg-sky-500" },
    { key: "finance", label: i18nText("ui.literals.k1b48d3f01424"), color: "bg-amber-500" },
  ];
  const max = Math.max(1, ...queues.map((queue) => cases.filter((item) => item.queue === queue.key && !["resolved", "closed"].includes(item.status)).length));
  return (
    <section className="border-y border-zinc-200 bg-white p-5 sm:rounded-lg sm:border">
      <div className="flex items-center justify-between">
        <div><h2 className="text-sm font-black text-zinc-950">{i18nText("ui.literals.k4eecc19f67c9")}</h2><p className="mt-1 text-xs font-medium text-zinc-500">{i18nText("ui.literals.k237ce205decc")}</p></div>
        <SlidersHorizontal size={18} className="text-zinc-400" />
      </div>
      <div className="mt-5 space-y-4">
        {queues.map((queue) => {
          const total = cases.filter((item) => item.queue === queue.key && !["resolved", "closed"].includes(item.status)).length;
          return (
            <div key={queue.key}>
              <div className="mb-1.5 flex justify-between text-xs font-bold text-zinc-700"><span>{translateUi(queue.label)}</span><span>{total}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full rounded-full ${queue.color}`} style={{ width: `${Math.max(total ? 8 : 0, (total / max) * 100)}%` }} /></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function OverviewView({ summary, cases, onOpenCase, onNavigate, refreshing, onRefresh }) {
  useUiLocale();
  const openCases = cases.filter((item) => !["resolved", "closed"].includes(item.status));
  return (
    <>
      <PageHeading
        eyebrow="Live operations"
        title={i18nText("ui.literals.k8e0197f4c3fd")}
        description={i18nText("ui.literals.kae8c7c40341a")}
        action={<button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-black text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"><RefreshCw className={refreshing ? "animate-spin" : ""} size={16} /> {i18nText("ui.literals.k56e3badc4e6c")}</button>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label={i18nText("ui.literals.k3c83436a2c5e")} value={summary.openCases} detail={i18nText("ui.literals.k9efa31cfd970")} icon={FileWarning} />
        <Metric label={i18nText("ui.literals.kecb26f46e394")} value={summary.urgentCases} detail={i18nText("ui.literals.kc3b3eb921b8b")} tone="red" icon={AlertTriangle} />
        <Metric label={i18nText("ui.literals.ke57016edceec")} value={summary.unassignedCases} detail={i18nText("ui.literals.kddb313377ea7")} tone="amber" icon={UsersRound} />
        <Metric label={i18nText("ui.literals.k07217c77199f")} value={summary.overdueCases} detail={i18nText("ui.literals.ked54e386cbc6")} tone="sky" icon={Clock3} />
        <Metric label={i18nText("ui.literals.kbc2cb3ef62b7")} value={summary.resolvedToday} detail={i18nText("ui.literals.ke8ffa0c1987f")} tone="emerald" icon={ShieldCheck} />
      </section>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.7fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-base font-black text-zinc-950">{i18nText("ui.literals.ka5ae2acb205d")}</h2><p className="mt-1 text-xs font-medium text-zinc-500">{i18nText("ui.literals.k0834529bfcbc")}</p></div><button type="button" onClick={() => onNavigate("my-work")} className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:text-emerald-900">{i18nText("ui.literals.k97a3dbf38f5c")} <ChevronRight size={15} /></button></div>
          <CaseTable cases={openCases.slice().sort((a, b) => ["critical", "urgent", "high", "normal", "low"].indexOf(a.priority) - ["critical", "urgent", "high", "normal", "low"].indexOf(b.priority)).slice(0, 8)} onOpen={onOpenCase} />
        </section>
        <QueueSummary cases={cases} />
      </div>

      <section className="mt-6 grid gap-3 md:grid-cols-3">
        {[
          { sector: "explore", label: "Explore", description: i18nText("ui.literals.k9b09654e9988"), tone: "border-cyan-200", count: summary.bySector?.explore || 0 },
          { sector: "marketplace", label: "UrMall", description: i18nText("ui.literals.k6465d1ea056d"), tone: "border-emerald-200", count: summary.bySector?.marketplace || 0 },
          { sector: "transport", label: i18nText("ui.literals.kc10d76c9a4b8"), description: i18nText("ui.literals.k2a4affb936c8"), tone: "border-violet-200", count: summary.bySector?.transport || 0 },
        ].map((sector) => (
          <button type="button" key={sector.sector} onClick={() => onNavigate(sector.sector)} className={`flex min-h-28 items-center justify-between rounded-lg border-l-4 bg-white p-4 text-left shadow-sm hover:bg-zinc-50 ${sector.tone}`}>
            <span><span className="block text-sm font-black text-zinc-950">{translateUi(sector.label)}</span><span className="mt-2 block text-xs font-medium leading-5 text-zinc-500">{translateUi(sector.description)}</span></span>
            <span className="ml-3 text-3xl font-black text-zinc-900">{sector.count}</span>
          </button>
        ))}
      </section>
    </>
  );
}

export function QueueView({ title, description, cases, onOpenCase, defaultQueue = "", defaultSector = "", assignee = "", hideHeading = false }) {
  useUiLocale();
  const [status, setStatus] = useState("open");
  const [caseType, setCaseType] = useState("all");
  const [search, setSearch] = useState("");
  const typeOptions = useMemo(() => {
    const options = new Map();
    cases.forEach((item) => {
      if (defaultQueue && item.queue !== defaultQueue) return;
      if (defaultSector && item.sector !== defaultSector) return;
      const value = item.case_type || item.resource_type || "case";
      options.set(value, getCaseTypeLabel(item));
    });
    return Array.from(options.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [cases, defaultQueue, defaultSector]);
  const visible = useMemo(() => cases.filter((item) => {
    if (defaultQueue && item.queue !== defaultQueue) return false;
    if (defaultSector && item.sector !== defaultSector) return false;
    if (assignee === "me" && !item.assignee_user_id) return false;
    if (status === "open" && ["resolved", "closed"].includes(item.status)) return false;
    if (status !== "open" && status !== "all" && item.status !== status) return false;
    if (caseType !== "all" && item.case_type !== caseType && item.resource_type !== caseType) return false;
    if (search && !getCaseSearchText(item).includes(search.toLowerCase())) return false;
    return true;
  }), [assignee, caseType, cases, defaultQueue, defaultSector, search, status]);

  return (
    <>
      {!hideHeading ? <PageHeading eyebrow="Operations queue" title={translateUi(title)} description={translateUi(description)} /> : null}
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center">
        <label className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={i18nText("ui.literals.kfb7863b74b70")} className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:bg-white" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 outline-none focus:border-emerald-600">
          <option value="open">{i18nText("ui.literals.k1db9a9db1638")}</option><option value="new">{i18nText("ui.literals.k6403f2b7eb2a")}</option><option value="in_review">{i18nText("ui.literals.kc49bceb8a70b")}</option><option value="waiting_information">{i18nText("ui.literals.k9d79aa5433e2")}</option><option value="resolved">{i18nText("ui.literals.kd999aeb0545f")}</option><option value="all">{i18nText("ui.literals.k6405179d241b")}</option>
        </select>
        <select value={caseType} onChange={(event) => setCaseType(event.target.value)} className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 outline-none focus:border-emerald-600">
          <option value="all">{i18nText("ui.literals.k626a5b9cd014")}</option>
          {typeOptions.map((option) => <option key={option.value} value={option.value}>{translateUi(option.label)}</option>)}
        </select>
        <span className="whitespace-nowrap px-2 text-xs font-black text-zinc-500">{visible.length} {i18nText("ui.literals.kf9063c359f30")}</span>
      </div>
      <CaseTable cases={visible} onOpen={onOpenCase} />
    </>
  );
}

const sectorCopy = {
  explore: { eyebrow: "Explore sector", title: "Explore operations", description: "Moderation, reports, profile safety, adverts, and community enforcement.", lanes: ["Content reports", "Profile safety", "Video review", "Appeals"] },
  marketplace: { eyebrow: "UrMall sector", title: "UrMall operations", description: "Seller verification, product safety, orders, reviews, disputes, and commerce risk.", lanes: ["Seller reviews", "Product safety", "Order disputes", "Seller health"] },
  transport: { eyebrow: "Transport sector", title: "Transport operations", description: "Operator and fleet verification, trip safety, support, companies, and Area View.", lanes: ["Operator reviews", "Fleet checks", "Trip incidents", "Area reports"] },
};

export function SectorView({ sector, cases, onOpenCase }) {
  useUiLocale();
  const copy = sectorCopy[sector];
  const sectorCases = cases.filter((item) => item.sector === sector);
  return (
    <>
      <PageHeading eyebrow={copy.eyebrow} title={translateUi(copy.title)} description={translateUi(copy.description)} />
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {copy.lanes.map((label, index) => <Metric key={label} label={translateUi(label)} value={index === 0 ? sectorCases.length : sectorCases.filter((item) => item.queue === ["verification", "reports", "support", "finance"][index - 1]).length} detail={i18nText("ui.literals.k6ddbd6552812")} tone={["zinc", "emerald", "amber", "sky"][index]} />)}
      </section>
      <QueueView title={i18nText("ui.literals.kc4396f66d55c", { value0: copy.title })} description={i18nText("ui.literals.kc1b2ab29fea6")} cases={cases} defaultSector={sector} onOpenCase={onOpenCase} hideHeading />
    </>
  );
}

export function NotificationsView({ access }) {
  useUiLocale();
  return <NotificationCampaignCenter access={access} />;
}

export function FinanceView({ cases, onOpenCase }) {
  useUiLocale();
  return (
    <>
      <PageHeading eyebrow="Financial operations" title={i18nText("ui.literals.k1b48d3f01424")} description={i18nText("ui.literals.k1943e5699108")} />
      <div className="mb-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"><LockKeyhole className="shrink-0 text-amber-700" size={20} /><div><p className="text-sm font-black text-amber-950">{i18nText("ui.literals.k34fcef425844")}</p><p className="mt-1 text-xs font-medium leading-5 text-amber-800">{i18nText("ui.literals.k838518156959")}</p></div></div>
      <section className="mb-6 grid gap-3 sm:grid-cols-3"><Metric label={i18nText("ui.literals.k6a80f44e3b2b")} value={cases.filter((item) => item.queue === "finance" && !["resolved", "closed"].includes(item.status)).length} detail={i18nText("ui.literals.kf73a7d305def")} icon={CircleDollarSign} /><Metric label={i18nText("ui.literals.kb8d012c2004f")} value={cases.filter((item) => item.status === "approval_required").length} detail={i18nText("ui.literals.ke119ca5f75a6")} tone="amber" icon={ShieldCheck} /><Metric label={i18nText("ui.literals.kdd7855d2ff92")} value="Offline" detail={i18nText("ui.literals.k78fd4f9bbef4")} tone="red" icon={ShieldOff} /></section>
      <QueueView title={i18nText("ui.literals.ka8b4dc6e4701")} description={i18nText("ui.literals.k35b9ad586f1e")} cases={cases} defaultQueue="finance" onOpenCase={onOpenCase} />
    </>
  );
}

export function AnalyticsView({ summary, cases }) {
  useUiLocale();
  const sectors = ["explore", "marketplace", "transport"];
  const max = Math.max(1, ...sectors.map((sector) => cases.filter((item) => item.sector === sector).length));
  return (
    <>
      <PageHeading eyebrow="Operational intelligence" title={i18nText("ui.literals.k25bc96295797")} description={i18nText("ui.literals.kf47f755af8a8")} />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label={i18nText("ui.literals.kdb5aba313d08")} value={summary.openCases} detail={i18nText("ui.literals.k84c90dcaccc2")} /><Metric label={i18nText("ui.literals.k894fdb0eb6e8")} value={summary.overdueCases} detail={i18nText("ui.literals.k6eeca62582e8")} tone="red" /><Metric label={i18nText("ui.literals.kbeeb64d1c49d")} value={summary.resolvedToday} detail={i18nText("ui.literals.k57130ea5e877")} tone="emerald" /><Metric label={i18nText("ui.literals.kfa4ddda5fa52")} value={`${summary.openCases ? Math.round((summary.unassignedCases / summary.openCases) * 100) : 0}%`} detail={i18nText("ui.literals.k891dc228801b")} tone="amber" /></section>
      <section className="mt-6 border-y border-zinc-200 bg-white p-5 sm:rounded-lg sm:border"><h2 className="text-base font-black text-zinc-950">{i18nText("ui.literals.k397d2b22bc4f")}</h2><div className="mt-6 space-y-5">{sectors.map((sector) => { const total = cases.filter((item) => item.sector === sector).length; return <div key={sector}><div className="mb-2 flex justify-between text-sm font-bold text-zinc-700"><span>{sector === "marketplace" ? "UrMall" : titleCase(sector)}</span><span>{total} {i18nText("ui.literals.kf9063c359f30")}</span></div><div className="h-3 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full rounded-full ${sector === "explore" ? "bg-cyan-500" : sector === "marketplace" ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${(total / max) * 100}%` }} /></div></div>; })}</div></section>
    </>
  );
}

export function TeamView({ access }) {
  useUiLocale();
  const [team, setTeam] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", roleKey: "support_officer", sectors: ["all"], regions: ["all"], responsibilities: ["user_support"], authority: 2, expiresAt: "", reason: "" });
  const canManage = access.permissions.includes("team.manage");
  const currentRank = Math.max(...(access.roles || []).map((role) => role.rank || 0), 0);
  const roles = ADMIN_ROLES.filter((role) => access.roles?.some((item) => item.key === "super_admin") || role.rank < currentRank);

  function load() { getAdminTeam().then(setTeam).catch((nextError) => setError(inlineErrorMessage(nextError))); }
  useEffect(load, []);

  async function grant(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await grantAdminAccess(form); setDialogOpen(false); setForm({ email: "", roleKey: "support_officer", sectors: ["all"], regions: ["all"], responsibilities: ["user_support"], authority: 2, expiresAt: "", reason: "" }); load(); }
    catch (nextError) { setError(inlineErrorMessage(nextError)); } finally { setBusy(false); }
  }

  async function revoke(item) {
    const reason = window.prompt(`Reason for revoking ${item.display_name || item.email}?`);
    if (!reason?.trim()) return;
    setBusy(true); setError("");
    try { await revokeAdminAccess(item.assignment_id, reason.trim()); load(); }
    catch (nextError) { setError(inlineErrorMessage(nextError)); } finally { setBusy(false); }
  }

  function toggleSector(value) {
    setForm((current) => {
      if (value === "all") return { ...current, sectors: ["all"] };
      const withoutAll = current.sectors.filter((item) => item !== "all");
      const sectors = withoutAll.includes(value) ? withoutAll.filter((item) => item !== value) : [...withoutAll, value];
      return { ...current, sectors: sectors.length ? sectors : ["all"] };
    });
  }

  function toggleResponsibility(value) {
    setForm((current) => ({
      ...current,
      responsibilities: current.responsibilities.includes(value)
        ? current.responsibilities.filter((item) => item !== value)
        : [...current.responsibilities, value],
    }));
  }

  return (
    <>
      <PageHeading eyebrow="Access governance" title={i18nText("ui.literals.k221df061bcfe")} description={i18nText("ui.literals.k9307704b8596")} action={canManage ? <button type="button" onClick={() => setDialogOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800"><UserPlus size={17} /> {i18nText("ui.literals.kb91195f1ab01")}</button> : null} />
      <div className="overflow-hidden border-y border-zinc-200 bg-white sm:rounded-lg sm:border">
        {team.map((item) => (
          <article key={item.assignment_id} className="grid gap-3 border-b border-zinc-100 p-4 last:border-0 md:grid-cols-[minmax(0,1.3fr)_minmax(10rem,0.7fr)_minmax(10rem,0.8fr)_auto] md:items-center">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-sm font-black text-zinc-700">{(item.display_name || item.email || "A").slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-black text-zinc-950">{item.display_name || i18nText("ui.literals.k1eda23758be9")}</p><p className="mt-1 truncate text-xs font-medium text-zinc-500">{item.email}</p></div></div>
            <div><p className="text-xs font-black text-zinc-800">{item.role_name}</p><p className="mt-1 text-[11px] font-semibold text-zinc-500">{i18nText("ui.literals.k97a9869cf89f")} {item.authority_level}{item.expires_at ? i18nText("ui.literals.kdb31016376a4", { value0: formatDateTime(item.expires_at) }) : i18nText("ui.literals.k7c7f5fd01f59")}</p></div>
            <div><div className="flex flex-wrap gap-1">{item.sector_scopes?.map((sector) => <span key={sector} className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800">{sector === "all" ? i18nText("ui.literals.k3473d884bb86") : sector === "marketplace" ? "UrMall" : titleCase(sector)}</span>)}</div>{item.responsibilities?.length ? <p className="mt-2 line-clamp-2 text-[10px] font-semibold text-zinc-500">{item.responsibilities.map(titleCase).join(" · ")}</p> : null}</div>
            {canManage && item.status === "active" ? <button type="button" title={i18nText("ui.literals.k094386f681e2")} disabled={busy} onClick={() => revoke(item)} className="grid h-9 w-9 place-items-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><UserMinus size={17} /></button> : <span className="text-xs font-bold text-zinc-400">{titleCase(item.status)}</span>}
          </article>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{translateUi(error)}</p> : null}

      {dialogOpen ? <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"><button type="button" className="absolute inset-0 bg-zinc-950/50" aria-label={i18nText("ui.literals.kbbfa773e5a63")} onClick={() => setDialogOpen(false)} /><form onSubmit={grant} className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl sm:p-6"><div className="flex justify-between"><div><p className="text-xs font-black uppercase text-emerald-700">{i18nText("ui.literals.kd72cd6d333e1")}</p><h2 className="mt-1 text-xl font-black">{i18nText("ui.literals.kb91195f1ab01")}</h2></div><button type="button" title={i18nText("ui.literals.kbbfa773e5a63")} onClick={() => setDialogOpen(false)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-zinc-100"><X size={19} /></button></div>
        <div className="mt-5 space-y-4"><label className="block"><span className="mb-1.5 block text-sm font-bold">{i18nText("ui.literals.kf9609349275b")}</span><input type="email" required value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-semibold outline-none focus:border-emerald-600" /></label><label className="block"><span className="mb-1.5 block text-sm font-bold">{i18nText("ui.literals.kc3f104d13657")}</span><select value={form.roleKey} onChange={(event) => { const role = ADMIN_ROLES.find((item) => item.key === event.target.value); setForm((current) => ({ ...current, roleKey: event.target.value, authority: role?.authority || current.authority })); }} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-bold">{roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select></label>
          <fieldset><legend className="text-sm font-bold">{i18nText("ui.literals.kdd139c730b52")}</legend><div className="mt-2 grid grid-cols-2 gap-2">{ADMIN_SECTORS.map((sector) => <label key={sector.value} className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold"><input type="checkbox" checked={form.sectors.includes(sector.value)} onChange={() => toggleSector(sector.value)} className="accent-emerald-700" /> {translateUi(sector.label)}</label>)}</div></fieldset>
          <label className="block"><span className="mb-1.5 block text-sm font-bold">{i18nText("ui.literals.k7ed8c49e9e54")}</span><input value={form.regions.join(", ")} onChange={(event) => setForm((current) => ({ ...current, regions: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) }))} placeholder={i18nText("ui.literals.k3e4312d1fc7f")} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-semibold outline-none focus:border-emerald-600" /><span className="mt-1 block text-xs font-semibold text-zinc-400">{i18nText("ui.literals.kf956bb94e086")}</span></label>
          <fieldset><legend className="text-sm font-bold">{i18nText("ui.literals.k54dc6e55f143")}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{ADMIN_RESPONSIBILITIES.map((responsibility) => <label key={responsibility.value} className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={form.responsibilities.includes(responsibility.value)} onChange={() => toggleResponsibility(responsibility.value)} className="accent-emerald-700" /> {translateUi(responsibility.label)}</label>)}</div></fieldset>
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs font-semibold leading-5 text-sky-900"><span className="font-black">{i18nText("ui.literals.k131e07f1aee1")}</span> {ADMIN_ROLES.find((role) => role.key === form.roleKey)?.name} · {form.sectors.map((sector) => sector === "marketplace" ? "UrMall" : titleCase(sector)).join(", ")} {i18nText("ui.literals.k609e4c31201d")} {form.authority} · {form.responsibilities.length} {i18nText("ui.literals.kba0f8ea52451")}</div>
          <label className="block"><span className="mb-1.5 flex justify-between text-sm font-bold"><span>{i18nText("ui.literals.kebe4690f3c74")}</span><span>{form.authority}</span></span><input type="range" min="1" max="5" value={form.authority} onChange={(event) => setForm((current) => ({ ...current, authority: Number(event.target.value) }))} className="w-full accent-emerald-700" /></label><label className="block"><span className="mb-1.5 block text-sm font-bold">{i18nText("ui.literals.ka6115deaec37")} <span className="font-semibold text-zinc-400">{i18nText("ui.literals.kb16c7ac6faff")}</span></span><input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-semibold outline-none focus:border-emerald-600" /></label><label className="block"><span className="mb-1.5 block text-sm font-bold">{i18nText("ui.literals.ka73104616435")}</span><textarea required minLength={5} rows={3} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className="w-full resize-none rounded-lg border border-zinc-300 p-3 text-sm font-medium outline-none focus:border-emerald-600" /></label></div>
        <button type="submit" disabled={busy} className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <UserPlus size={17} />} {i18nText("ui.literals.k02c717ba56b7")}</button></form></div> : null}
    </>
  );
}

export function AuditView() {
  useUiLocale();
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { getAuditLog().then(setLogs).catch((nextError) => setError(inlineErrorMessage(nextError))); }, []);
  return (
    <>
      <PageHeading eyebrow="Governance" title={i18nText("ui.literals.k3cfc5f1cc987")} description={i18nText("ui.literals.k5c076a2d055b")} />
      <div className="overflow-hidden border-y border-zinc-200 bg-white sm:rounded-lg sm:border">{logs.map((item) => <article key={item.id} className="grid gap-2 border-b border-zinc-100 px-4 py-4 last:border-0 md:grid-cols-[minmax(12rem,1fr)_minmax(8rem,0.5fr)_minmax(12rem,1.4fr)_auto] md:items-center"><div><p className="text-sm font-black text-zinc-900">{titleCase(item.action_key?.replaceAll(".", " "))}</p><p className="mt-1 text-xs font-semibold text-zinc-500">{item.actor_display_name || i18nText("ui.literals.k497b9f51d314")}{item.actor_email ? ` · ${item.actor_email}` : ""}</p><p className="mt-1 text-[10px] font-bold text-zinc-400">{item.actor_role_keys?.map(titleCase).join(", ") || i18nText("ui.literals.k0004af20a7b2")}</p></div><span className="w-fit rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-700">{item.sector === "marketplace" ? "UrMall" : titleCase(item.sector || i18nText("ui.literals.k3c72abbe626f"))}</span><p className="text-xs font-medium text-zinc-600">{item.reason || titleCase(item.resource_type || i18nText("ui.literals.k295432a291bb"))}</p><time className="text-xs font-semibold text-zinc-400">{formatDateTime(item.created_at)}</time></article>)}</div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{translateUi(error)}</p> : null}
    </>
  );
}

export function SettingsView({ access }) {
  useUiLocale();
  const [flags, setFlags] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const canManage = access.permissions.includes("settings.manage");
  function load() { getFeatureFlags().then(setFlags).catch((nextError) => setError(inlineErrorMessage(nextError))); }
  useEffect(load, []);
  async function toggle(item) {
    const reason = window.prompt(`Reason for ${item.enabled ? "disabling" : "enabling"} ${item.name}?`);
    if (!reason?.trim()) return;
    setBusy(item.flag_key); setError("");
    try { const updated = await updateFeatureFlag(item.flag_key, !item.enabled, reason.trim()); setFlags((current) => current.map((flag) => flag.flag_key === item.flag_key ? { ...flag, ...updated } : flag)); }
    catch (nextError) { setError(inlineErrorMessage(nextError)); } finally { setBusy(""); }
  }
  return (
    <>
      <PageHeading eyebrow="Platform controls" title={i18nText("ui.literals.kc7f73bb54d92")} description={i18nText("ui.literals.k6e393bf308c9")} />
      <section className="overflow-hidden border-y border-zinc-200 bg-white sm:rounded-lg sm:border">{flags.map((item) => <article key={item.flag_key} className="flex items-center gap-4 border-b border-zinc-100 p-4 last:border-0"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${item.enabled ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>{item.enabled ? <Activity size={18} /> : <ShieldOff size={18} />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-zinc-950">{item.name}</p><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-600">{item.sector === "marketplace" ? "UrMall" : titleCase(item.sector)}</span></div><p className="mt-1 text-xs font-medium leading-5 text-zinc-500">{translateUi(item.description)}</p></div><button type="button" role="switch" aria-checked={item.enabled} disabled={!canManage || busy === item.flag_key} onClick={() => toggle(item)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${item.enabled ? "bg-emerald-600" : "bg-zinc-300"} disabled:opacity-50`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${item.enabled ? "left-6" : "left-1"}`} /></button></article>)}</section>
      <div className="mt-5 rounded-lg border border-zinc-200 bg-white p-4"><div className="flex gap-3"><BadgeCheck className="shrink-0 text-emerald-700" size={20} /><div><p className="text-sm font-black text-zinc-950">{i18nText("ui.literals.kb298eec757d3")}</p><p className="mt-1 text-xs font-medium leading-5 text-zinc-500">{i18nText("ui.literals.k5e18131afaf6")}</p></div></div></div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{translateUi(error)}</p> : null}
    </>
  );
}
