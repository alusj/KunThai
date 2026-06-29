import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BellRing,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileWarning,
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
import { ADMIN_ROLES, ADMIN_SECTORS, formatDateTime, formatRelativeTime, titleCase } from "../adminConfig";
import {
  approveNotificationCampaign,
  createNotificationCampaign,
  getAdminTeam,
  getAuditLog,
  getFeatureFlags,
  getNotificationCampaigns,
  grantAdminAccess,
  publishNotificationCampaign,
  revokeAdminAccess,
  searchAdminUsers,
  setAdminUserStatus,
  updateFeatureFlag,
} from "../adminService";
import CaseTable from "../components/CaseTable";

export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow ? <p className="text-xs font-black uppercase text-emerald-700">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-black text-zinc-950 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-zinc-600">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

function Metric({ label, value, detail, tone = "zinc", icon: Icon }) {
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
        <p className="text-xs font-black uppercase opacity-65">{label}</p>
        {Icon ? <Icon size={18} className="opacity-60" /> : null}
      </div>
      <p className="mt-3 text-3xl font-black">{value ?? 0}</p>
      <p className="mt-1 text-xs font-semibold opacity-60">{detail}</p>
    </div>
  );
}

function QueueSummary({ cases }) {
  const queues = [
    { key: "verification", label: "Verification", color: "bg-emerald-500" },
    { key: "reports", label: "Reports and safety", color: "bg-red-500" },
    { key: "support", label: "Support", color: "bg-sky-500" },
    { key: "finance", label: "Finance", color: "bg-amber-500" },
  ];
  const max = Math.max(1, ...queues.map((queue) => cases.filter((item) => item.queue === queue.key && !["resolved", "closed"].includes(item.status)).length));
  return (
    <section className="border-y border-zinc-200 bg-white p-5 sm:rounded-lg sm:border">
      <div className="flex items-center justify-between">
        <div><h2 className="text-sm font-black text-zinc-950">Queue load</h2><p className="mt-1 text-xs font-medium text-zinc-500">Current open workload by function</p></div>
        <SlidersHorizontal size={18} className="text-zinc-400" />
      </div>
      <div className="mt-5 space-y-4">
        {queues.map((queue) => {
          const total = cases.filter((item) => item.queue === queue.key && !["resolved", "closed"].includes(item.status)).length;
          return (
            <div key={queue.key}>
              <div className="mb-1.5 flex justify-between text-xs font-bold text-zinc-700"><span>{queue.label}</span><span>{total}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full rounded-full ${queue.color}`} style={{ width: `${Math.max(total ? 8 : 0, (total / max) * 100)}%` }} /></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function OverviewView({ summary, cases, onOpenCase, onNavigate, refreshing, onRefresh }) {
  const openCases = cases.filter((item) => !["resolved", "closed"].includes(item.status));
  return (
    <>
      <PageHeading
        eyebrow="Live operations"
        title="Command center"
        description="A role-scoped view of the work requiring attention across KunThai."
        action={<button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-black text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"><RefreshCw className={refreshing ? "animate-spin" : ""} size={16} /> Refresh</button>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Open cases" value={summary.openCases} detail="Across accessible queues" icon={FileWarning} />
        <Metric label="Urgent" value={summary.urgentCases} detail="Urgent or critical" tone="red" icon={AlertTriangle} />
        <Metric label="Unassigned" value={summary.unassignedCases} detail="Needs an owner" tone="amber" icon={UsersRound} />
        <Metric label="Overdue" value={summary.overdueCases} detail="Outside SLA" tone="sky" icon={Clock3} />
        <Metric label="Resolved today" value={summary.resolvedToday} detail="Completed since midnight" tone="emerald" icon={ShieldCheck} />
      </section>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.7fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-base font-black text-zinc-950">Priority work</h2><p className="mt-1 text-xs font-medium text-zinc-500">Highest-impact open cases</p></div><button type="button" onClick={() => onNavigate("my-work")} className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:text-emerald-900">Open queue <ChevronRight size={15} /></button></div>
          <CaseTable cases={openCases.slice().sort((a, b) => ["critical", "urgent", "high", "normal", "low"].indexOf(a.priority) - ["critical", "urgent", "high", "normal", "low"].indexOf(b.priority)).slice(0, 8)} onOpen={onOpenCase} />
        </section>
        <QueueSummary cases={cases} />
      </div>

      <section className="mt-6 grid gap-3 md:grid-cols-3">
        {[
          { sector: "explore", label: "Explore", description: "Content, profiles, adverts, and community safety", tone: "border-cyan-200", count: summary.bySector?.explore || 0 },
          { sector: "marketplace", label: "UrMall", description: "Sellers, products, orders, and commerce disputes", tone: "border-emerald-200", count: summary.bySector?.marketplace || 0 },
          { sector: "transport", label: "Transport", description: "Operators, fleets, trips, incidents, and Area View", tone: "border-violet-200", count: summary.bySector?.transport || 0 },
        ].map((sector) => (
          <button type="button" key={sector.sector} onClick={() => onNavigate(sector.sector)} className={`flex min-h-28 items-center justify-between rounded-lg border-l-4 bg-white p-4 text-left shadow-sm hover:bg-zinc-50 ${sector.tone}`}>
            <span><span className="block text-sm font-black text-zinc-950">{sector.label}</span><span className="mt-2 block text-xs font-medium leading-5 text-zinc-500">{sector.description}</span></span>
            <span className="ml-3 text-3xl font-black text-zinc-900">{sector.count}</span>
          </button>
        ))}
      </section>
    </>
  );
}

export function QueueView({ title, description, cases, onOpenCase, defaultQueue = "", defaultSector = "", assignee = "", hideHeading = false }) {
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const visible = useMemo(() => cases.filter((item) => {
    if (defaultQueue && item.queue !== defaultQueue) return false;
    if (defaultSector && item.sector !== defaultSector) return false;
    if (assignee === "me" && !item.assignee_user_id) return false;
    if (status === "open" && ["resolved", "closed"].includes(item.status)) return false;
    if (status !== "open" && status !== "all" && item.status !== status) return false;
    if (search && !`${item.case_number} ${item.title} ${item.description}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [assignee, cases, defaultQueue, defaultSector, search, status]);

  return (
    <>
      {!hideHeading ? <PageHeading eyebrow="Operations queue" title={title} description={description} /> : null}
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center">
        <label className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this queue" className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:bg-white" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 outline-none focus:border-emerald-600">
          <option value="open">Open work</option><option value="new">New</option><option value="in_review">In review</option><option value="waiting_information">Waiting for information</option><option value="resolved">Resolved</option><option value="all">All statuses</option>
        </select>
        <span className="whitespace-nowrap px-2 text-xs font-black text-zinc-500">{visible.length} cases</span>
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
  const copy = sectorCopy[sector];
  const sectorCases = cases.filter((item) => item.sector === sector);
  return (
    <>
      <PageHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {copy.lanes.map((label, index) => <Metric key={label} label={label} value={index === 0 ? sectorCases.length : sectorCases.filter((item) => item.queue === ["verification", "reports", "support", "finance"][index - 1]).length} detail="Open and active" tone={["zinc", "emerald", "amber", "sky"][index]} />)}
      </section>
      <QueueView title={`${copy.title} queue`} description="All cases available within your assigned sector scope." cases={cases} defaultSector={sector} onOpenCase={onOpenCase} hideHeading />
    </>
  );
}

export function UsersView({ access }) {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [control, setControl] = useState({ status: "warned", reason: "", sectors: ["all"], expiresAt: "" });
  const canManage = access.permissions.includes("users.manage");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchAdminUsers(search).then(setUsers).catch((nextError) => setError(nextError.message)).finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function saveControl(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const updated = await setAdminUserStatus({ userId: selectedUser.user_id, ...control });
      setUsers((current) => current.map((item) => item.user_id === selectedUser.user_id ? {
        ...item,
        account_status: updated.status,
        status_reason: updated.reason,
        status_expires_at: updated.expires_at,
      } : item));
      setSelectedUser(null);
      setControl({ status: "warned", reason: "", sectors: ["all"], expiresAt: "" });
    } catch (nextError) {
      setError(nextError.message || "Unable to update this account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading eyebrow="Platform directory" title="Users" description="Find a KunThai identity and see its platform account type. Sensitive actions remain case-based and audited." />
      <label className="relative mb-4 block max-w-2xl"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, username, email, or phone" className="h-11 w-full rounded-lg border border-zinc-300 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>
      <div className="overflow-hidden border-y border-zinc-200 bg-white sm:rounded-lg sm:border">
        {loading ? <div className="flex items-center gap-2 px-5 py-10 text-sm font-semibold text-zinc-500"><LoaderCircle className="animate-spin" size={18} /> Loading users…</div> : null}
        {!loading ? users.map((item) => (
          <article key={item.user_id} className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-4 last:border-0 sm:flex-row sm:items-center">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-sm font-black text-zinc-700">{(item.display_name || item.email || "U").slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-zinc-950">{item.display_name || "Unnamed account"}</p><p className="mt-1 truncate text-xs font-medium text-zinc-500">{item.email || item.phone || "No contact information"} {item.username ? `· @${item.username}` : ""}</p></div>
            <div className="flex flex-wrap gap-1.5"><span className="w-fit rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-black text-zinc-700">{titleCase(item.account_type)}</span><span className={`w-fit rounded-full px-2 py-1 text-[11px] font-black ${item.account_status === "active" ? "bg-emerald-50 text-emerald-800" : item.account_status === "warned" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>{titleCase(item.account_status || "active")}</span></div>
            <span className="text-xs font-semibold text-zinc-400">Joined {formatRelativeTime(item.created_at)}</span>
            {canManage ? <button type="button" title="Manage account status" onClick={() => { setSelectedUser(item); setControl({ status: item.account_status || "warned", reason: item.status_reason || "", sectors: ["all"], expiresAt: "" }); }} className="grid h-9 w-9 place-items-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"><ShieldCheck size={17} /></button> : null}
          </article>
        )) : null}
        {!loading && !users.length ? <div className="px-5 py-12 text-center text-sm font-semibold text-zinc-500">No matching users.</div> : null}
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {selectedUser ? <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"><button type="button" aria-label="Close account controls" onClick={() => setSelectedUser(null)} className="absolute inset-0 bg-zinc-950/50" /><form onSubmit={saveControl} className="relative w-full max-w-lg rounded-lg bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-emerald-700">Account control</p><h2 className="mt-1 text-xl font-black text-zinc-950">{selectedUser.display_name || selectedUser.email}</h2><p className="mt-1 text-xs font-semibold text-zinc-500">{selectedUser.email}</p></div><button type="button" title="Close" onClick={() => setSelectedUser(null)} className="grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"><X size={19} /></button></div>
        <div className="mt-5 space-y-4"><label className="block"><span className="mb-1.5 block text-sm font-bold">Status</span><select value={control.status} onChange={(event) => setControl((current) => ({ ...current, status: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-bold"><option value="active">Active</option><option value="warned">Warned</option><option value="restricted">Restricted</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select></label>
          {control.status === "restricted" ? <fieldset><legend className="text-sm font-bold">Restricted sectors</legend><div className="mt-2 grid grid-cols-2 gap-2">{ADMIN_SECTORS.map((sector) => <label key={sector.value} className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold"><input type="checkbox" checked={control.sectors.includes(sector.value)} onChange={() => setControl((current) => { if (sector.value === "all") return { ...current, sectors: ["all"] }; const withoutAll = current.sectors.filter((item) => item !== "all"); const sectors = withoutAll.includes(sector.value) ? withoutAll.filter((item) => item !== sector.value) : [...withoutAll, sector.value]; return { ...current, sectors: sectors.length ? sectors : ["all"] }; })} className="accent-emerald-700" />{sector.label}</label>)}</div></fieldset> : null}
          <label className="block"><span className="mb-1.5 block text-sm font-bold">Expires (optional)</span><input type="datetime-local" value={control.expiresAt} onChange={(event) => setControl((current) => ({ ...current, expiresAt: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-semibold" /></label><label className="block"><span className="mb-1.5 block text-sm font-bold">Required reason</span><textarea required rows={3} value={control.reason} onChange={(event) => setControl((current) => ({ ...current, reason: event.target.value }))} className="w-full resize-none rounded-lg border border-zinc-300 p-3 text-sm font-medium outline-none focus:border-emerald-600" /></label></div>
        <button type="submit" disabled={busy} className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <ShieldCheck size={17} />} Apply account status</button></form></div> : null}
    </>
  );
}

export function NotificationsView({ access }) {
  const [campaigns, setCampaigns] = useState([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", body: "", sector: "platform", audience: "all", audienceValue: "", priority: "normal", schedule: "" });

  function load() { getNotificationCampaigns().then(setCampaigns).catch((nextError) => setError(nextError.message)); }
  useEffect(load, []);

  async function create(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const filter = form.audience === "specific_users"
        ? { emails: form.audienceValue.split(",").map((value) => value.trim()).filter(Boolean) }
        : form.audience === "region"
          ? { region: form.audienceValue.trim() }
          : form.audience === "account_type"
            ? { accountType: form.audienceValue }
            : {};
      const created = await createNotificationCampaign({ ...form, filter });
      setCampaigns((current) => [created, ...current]); setComposerOpen(false); setForm({ title: "", body: "", sector: "platform", audience: "all", audienceValue: "", priority: "normal", schedule: "" });
    }
    catch (nextError) { setError(nextError.message); } finally { setBusy(false); }
  }

  async function approve(id) {
    setBusy(true); setError("");
    try { const updated = await approveNotificationCampaign(id); setCampaigns((current) => current.map((item) => item.id === id ? { ...item, ...updated } : item)); }
    catch (nextError) { setError(nextError.message); } finally { setBusy(false); }
  }

  async function publish(id) {
    setBusy(true); setError("");
    try { const updated = await publishNotificationCampaign(id); setCampaigns((current) => current.map((item) => item.id === id ? { ...item, ...updated } : item)); }
    catch (nextError) { setError(nextError.message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeading eyebrow="Communications" title="Notifications" description="Draft, review, approve, schedule, and audit targeted platform messages." action={access.permissions.includes("notifications.manage") ? <button type="button" onClick={() => setComposerOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800"><Plus size={17} /> New campaign</button> : null} />
      <div className="overflow-hidden border-y border-zinc-200 bg-white sm:rounded-lg sm:border">
        {campaigns.map((item) => (
          <article key={item.id} className="flex flex-col gap-4 border-b border-zinc-100 p-4 last:border-0 lg:flex-row lg:items-center">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700"><BellRing size={19} /></span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-zinc-950">{item.title}</p><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-700">{titleCase(item.status)}</span></div><p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-zinc-500">{item.body}</p></div>
            <div className="text-xs font-semibold text-zinc-500"><p>{item.sector === "marketplace" ? "UrMall" : titleCase(item.sector)} · {titleCase(item.audience_type)}</p><p className="mt-1">{item.delivery_count || 0} delivered · {item.failure_count || 0} failed</p></div>
            {access.permissions.includes("notifications.approve") && ["draft", "pending_approval"].includes(item.status) ? <button type="button" disabled={busy} onClick={() => approve(item.id)} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-300 px-3 text-xs font-black text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"><Check size={15} /> Approve</button> : null}
            {access.permissions.includes("notifications.approve") && item.status === "approved" ? <button type="button" disabled={busy} onClick={() => publish(item.id)} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 text-xs font-black text-white hover:bg-zinc-800 disabled:opacity-50"><Send size={15} /> Publish</button> : null}
          </article>
        ))}
        {!campaigns.length ? <div className="px-5 py-14 text-center"><MailPlus className="mx-auto text-zinc-300" size={30} /><p className="mt-3 text-sm font-black text-zinc-900">No campaigns yet</p></div> : null}
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}

      {composerOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"><button type="button" aria-label="Close composer" className="absolute inset-0 bg-zinc-950/50" onClick={() => setComposerOpen(false)} /><form onSubmit={create} className="relative w-full max-w-xl rounded-lg bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase text-emerald-700">Notification campaign</p><h2 className="mt-1 text-xl font-black text-zinc-950">Compose message</h2></div><button type="button" title="Close" onClick={() => setComposerOpen(false)} className="grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"><X size={19} /></button></div>
          <div className="mt-5 space-y-4"><label className="block"><span className="mb-1.5 block text-sm font-bold">Title</span><input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-semibold outline-none focus:border-emerald-600" /></label><label className="block"><span className="mb-1.5 block text-sm font-bold">Message</span><textarea required rows={4} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} className="w-full resize-none rounded-lg border border-zinc-300 p-3 text-sm font-medium outline-none focus:border-emerald-600" /></label>
            <div className="grid gap-3 sm:grid-cols-3"><label><span className="mb-1.5 block text-xs font-black text-zinc-600">Sector</span><select value={form.sector} onChange={(event) => setForm((current) => ({ ...current, sector: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm font-bold"><option value="platform">Platform</option><option value="explore">Explore</option><option value="marketplace">UrMall</option><option value="transport">Transport</option></select></label><label><span className="mb-1.5 block text-xs font-black text-zinc-600">Audience</span><select value={form.audience} onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value, audienceValue: "" }))} className="h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm font-bold"><option value="all">All users</option><option value="sector_users">Sector users</option><option value="specific_users">Specific users</option><option value="region">Region</option><option value="account_type">Account type</option></select></label><label><span className="mb-1.5 block text-xs font-black text-zinc-600">Priority</span><select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm font-bold"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></div>
            {form.audience === "specific_users" ? <label className="block"><span className="mb-1.5 block text-sm font-bold">User emails</span><input required value={form.audienceValue} onChange={(event) => setForm((current) => ({ ...current, audienceValue: event.target.value }))} placeholder="first@example.com, second@example.com" className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-semibold outline-none focus:border-emerald-600" /></label> : null}
            {form.audience === "region" ? <label className="block"><span className="mb-1.5 block text-sm font-bold">Country or city</span><input required value={form.audienceValue} onChange={(event) => setForm((current) => ({ ...current, audienceValue: event.target.value }))} placeholder="Sierra Leone" className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-semibold outline-none focus:border-emerald-600" /></label> : null}
            {form.audience === "account_type" ? <label className="block"><span className="mb-1.5 block text-sm font-bold">Account type</span><select required value={form.audienceValue} onChange={(event) => setForm((current) => ({ ...current, audienceValue: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-bold"><option value="">Choose an account type</option><option value="personal">Personal</option><option value="business">Business</option><option value="operator">Operator</option></select></label> : null}
            <label className="block"><span className="mb-1.5 block text-sm font-bold">Schedule (optional)</span><input type="datetime-local" value={form.schedule} onChange={(event) => setForm((current) => ({ ...current, schedule: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-semibold outline-none focus:border-emerald-600" /></label></div>
          <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setComposerOpen(false)} className="h-10 rounded-lg border border-zinc-300 px-4 text-sm font-black text-zinc-700">Cancel</button><button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <MailPlus size={16} />} Save campaign</button></div></form></div>
      ) : null}
    </>
  );
}

export function FinanceView({ cases, onOpenCase }) {
  return (
    <>
      <PageHeading eyebrow="Financial operations" title="Finance" description="Payout, refund, transaction, and reconciliation controls require a connected payment provider and dual approval." />
      <div className="mb-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"><LockKeyhole className="shrink-0 text-amber-700" size={20} /><div><p className="text-sm font-black text-amber-950">Financial actions are protected</p><p className="mt-1 text-xs font-medium leading-5 text-amber-800">The case and approval workspace is ready. Live movement of money remains disabled until the UrMall payment provider and webhook reconciliation are connected.</p></div></div>
      <section className="mb-6 grid gap-3 sm:grid-cols-3"><Metric label="Pending review" value={cases.filter((item) => item.queue === "finance" && !["resolved", "closed"].includes(item.status)).length} detail="Needs finance officer" icon={CircleDollarSign} /><Metric label="Approval required" value={cases.filter((item) => item.status === "approval_required").length} detail="Two-person control" tone="amber" icon={ShieldCheck} /><Metric label="Provider status" value="Offline" detail="No live payment connector" tone="red" icon={ShieldOff} /></section>
      <QueueView title="Finance cases" description="Audited financial investigations and approval requests." cases={cases} defaultQueue="finance" onOpenCase={onOpenCase} />
    </>
  );
}

export function AnalyticsView({ summary, cases }) {
  const sectors = ["explore", "marketplace", "transport"];
  const max = Math.max(1, ...sectors.map((sector) => cases.filter((item) => item.sector === sector).length));
  return (
    <>
      <PageHeading eyebrow="Operational intelligence" title="Analytics" description="Workload, service-level pressure, and sector distribution from the accessible admin scope." />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Open workload" value={summary.openCases} detail="Current cases" /><Metric label="SLA pressure" value={summary.overdueCases} detail="Overdue cases" tone="red" /><Metric label="Resolution today" value={summary.resolvedToday} detail="Closed today" tone="emerald" /><Metric label="Unassigned rate" value={`${summary.openCases ? Math.round((summary.unassignedCases / summary.openCases) * 100) : 0}%`} detail="Without an owner" tone="amber" /></section>
      <section className="mt-6 border-y border-zinc-200 bg-white p-5 sm:rounded-lg sm:border"><h2 className="text-base font-black text-zinc-950">Sector workload</h2><div className="mt-6 space-y-5">{sectors.map((sector) => { const total = cases.filter((item) => item.sector === sector).length; return <div key={sector}><div className="mb-2 flex justify-between text-sm font-bold text-zinc-700"><span>{sector === "marketplace" ? "UrMall" : titleCase(sector)}</span><span>{total} cases</span></div><div className="h-3 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full rounded-full ${sector === "explore" ? "bg-cyan-500" : sector === "marketplace" ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${(total / max) * 100}%` }} /></div></div>; })}</div></section>
    </>
  );
}

export function TeamView({ access }) {
  const [team, setTeam] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", roleKey: "support_officer", sectors: ["all"], regions: ["all"], authority: 2, reason: "" });
  const canManage = access.permissions.includes("team.manage");
  const currentRank = Math.max(...(access.roles || []).map((role) => role.rank || 0), 0);
  const roles = ADMIN_ROLES.filter((role) => access.roles?.some((item) => item.key === "super_admin") || role.rank < currentRank);

  function load() { getAdminTeam().then(setTeam).catch((nextError) => setError(nextError.message)); }
  useEffect(load, []);

  async function grant(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await grantAdminAccess(form); setDialogOpen(false); setForm({ email: "", roleKey: "support_officer", sectors: ["all"], regions: ["all"], authority: 2, reason: "" }); load(); }
    catch (nextError) { setError(nextError.message); } finally { setBusy(false); }
  }

  async function revoke(item) {
    const reason = window.prompt(`Reason for revoking ${item.display_name || item.email}?`);
    if (!reason?.trim()) return;
    setBusy(true); setError("");
    try { await revokeAdminAccess(item.assignment_id, reason.trim()); load(); }
    catch (nextError) { setError(nextError.message); } finally { setBusy(false); }
  }

  function toggleSector(value) {
    setForm((current) => {
      if (value === "all") return { ...current, sectors: ["all"] };
      const withoutAll = current.sectors.filter((item) => item !== "all");
      const sectors = withoutAll.includes(value) ? withoutAll.filter((item) => item !== value) : [...withoutAll, value];
      return { ...current, sectors: sectors.length ? sectors : ["all"] };
    });
  }

  return (
    <>
      <PageHeading eyebrow="Access governance" title="Admin team" description="Assignments combine role, sector, region, and authority. Chief Admins see the complete operational panel." action={canManage ? <button type="button" onClick={() => setDialogOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800"><UserPlus size={17} /> Add administrator</button> : null} />
      <div className="overflow-hidden border-y border-zinc-200 bg-white sm:rounded-lg sm:border">
        {team.map((item) => (
          <article key={item.assignment_id} className="grid gap-3 border-b border-zinc-100 p-4 last:border-0 md:grid-cols-[minmax(0,1.3fr)_minmax(10rem,0.7fr)_minmax(10rem,0.8fr)_auto] md:items-center">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-sm font-black text-zinc-700">{(item.display_name || item.email || "A").slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-black text-zinc-950">{item.display_name || "Administrator"}</p><p className="mt-1 truncate text-xs font-medium text-zinc-500">{item.email}</p></div></div>
            <div><p className="text-xs font-black text-zinc-800">{item.role_name}</p><p className="mt-1 text-[11px] font-semibold text-zinc-500">Authority {item.authority_level}</p></div>
            <div className="flex flex-wrap gap-1">{item.sector_scopes?.map((sector) => <span key={sector} className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800">{sector === "all" ? "All sectors" : sector === "marketplace" ? "UrMall" : titleCase(sector)}</span>)}</div>
            {canManage && item.status === "active" ? <button type="button" title="Revoke access" disabled={busy} onClick={() => revoke(item)} className="grid h-9 w-9 place-items-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><UserMinus size={17} /></button> : <span className="text-xs font-bold text-zinc-400">{titleCase(item.status)}</span>}
          </article>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}

      {dialogOpen ? <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"><button type="button" className="absolute inset-0 bg-zinc-950/50" aria-label="Close" onClick={() => setDialogOpen(false)} /><form onSubmit={grant} className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl sm:p-6"><div className="flex justify-between"><div><p className="text-xs font-black uppercase text-emerald-700">Admin assignment</p><h2 className="mt-1 text-xl font-black">Add administrator</h2></div><button type="button" title="Close" onClick={() => setDialogOpen(false)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-zinc-100"><X size={19} /></button></div>
        <div className="mt-5 space-y-4"><label className="block"><span className="mb-1.5 block text-sm font-bold">Existing KunThai account email</span><input type="email" required value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-semibold outline-none focus:border-emerald-600" /></label><label className="block"><span className="mb-1.5 block text-sm font-bold">Role</span><select value={form.roleKey} onChange={(event) => { const role = ADMIN_ROLES.find((item) => item.key === event.target.value); setForm((current) => ({ ...current, roleKey: event.target.value, authority: role?.authority || current.authority })); }} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-bold">{roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select></label>
          <fieldset><legend className="text-sm font-bold">Sector scope</legend><div className="mt-2 grid grid-cols-2 gap-2">{ADMIN_SECTORS.map((sector) => <label key={sector.value} className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold"><input type="checkbox" checked={form.sectors.includes(sector.value)} onChange={() => toggleSector(sector.value)} className="accent-emerald-700" /> {sector.label}</label>)}</div></fieldset>
          <label className="block"><span className="mb-1.5 flex justify-between text-sm font-bold"><span>Authority level</span><span>{form.authority}</span></span><input type="range" min="1" max="5" value={form.authority} onChange={(event) => setForm((current) => ({ ...current, authority: Number(event.target.value) }))} className="w-full accent-emerald-700" /></label><label className="block"><span className="mb-1.5 block text-sm font-bold">Assignment reason</span><textarea required rows={3} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className="w-full resize-none rounded-lg border border-zinc-300 p-3 text-sm font-medium outline-none focus:border-emerald-600" /></label></div>
        <button type="submit" disabled={busy} className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <UserPlus size={17} />} Grant admin access</button></form></div> : null}
    </>
  );
}

export function AuditView() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { getAuditLog().then(setLogs).catch((nextError) => setError(nextError.message)); }, []);
  return (
    <>
      <PageHeading eyebrow="Governance" title="Audit log" description="An immutable record of administrative decisions, access changes, approvals, and configuration updates." />
      <div className="overflow-hidden border-y border-zinc-200 bg-white sm:rounded-lg sm:border">{logs.map((item) => <article key={item.id} className="grid gap-2 border-b border-zinc-100 px-4 py-4 last:border-0 md:grid-cols-[minmax(12rem,1fr)_minmax(8rem,0.5fr)_minmax(12rem,1.4fr)_auto] md:items-center"><div><p className="text-sm font-black text-zinc-900">{titleCase(item.action_key?.replaceAll(".", " "))}</p><p className="mt-1 text-xs font-semibold text-zinc-500">{item.actor_display_name || "KunThai system"}{item.actor_email ? ` · ${item.actor_email}` : ""}</p><p className="mt-1 text-[10px] font-bold text-zinc-400">{item.actor_role_keys?.map(titleCase).join(", ") || "System event"}</p></div><span className="w-fit rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-700">{item.sector === "marketplace" ? "UrMall" : titleCase(item.sector || "platform")}</span><p className="text-xs font-medium text-zinc-600">{item.reason || titleCase(item.resource_type || "platform event")}</p><time className="text-xs font-semibold text-zinc-400">{formatDateTime(item.created_at)}</time></article>)}</div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
    </>
  );
}

export function SettingsView({ access }) {
  const [flags, setFlags] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const canManage = access.permissions.includes("settings.manage");
  function load() { getFeatureFlags().then(setFlags).catch((nextError) => setError(nextError.message)); }
  useEffect(load, []);
  async function toggle(item) {
    const reason = window.prompt(`Reason for ${item.enabled ? "disabling" : "enabling"} ${item.name}?`);
    if (!reason?.trim()) return;
    setBusy(item.flag_key); setError("");
    try { const updated = await updateFeatureFlag(item.flag_key, !item.enabled, reason.trim()); setFlags((current) => current.map((flag) => flag.flag_key === item.flag_key ? { ...flag, ...updated } : flag)); }
    catch (nextError) { setError(nextError.message); } finally { setBusy(""); }
  }
  return (
    <>
      <PageHeading eyebrow="Platform controls" title="Settings" description="High-impact feature controls. Every change requires a reason and is written to the audit log." />
      <section className="overflow-hidden border-y border-zinc-200 bg-white sm:rounded-lg sm:border">{flags.map((item) => <article key={item.flag_key} className="flex items-center gap-4 border-b border-zinc-100 p-4 last:border-0"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${item.enabled ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>{item.enabled ? <Activity size={18} /> : <ShieldOff size={18} />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-zinc-950">{item.name}</p><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-600">{item.sector === "marketplace" ? "UrMall" : titleCase(item.sector)}</span></div><p className="mt-1 text-xs font-medium leading-5 text-zinc-500">{item.description}</p></div><button type="button" role="switch" aria-checked={item.enabled} disabled={!canManage || busy === item.flag_key} onClick={() => toggle(item)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${item.enabled ? "bg-emerald-600" : "bg-zinc-300"} disabled:opacity-50`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${item.enabled ? "left-6" : "left-1"}`} /></button></article>)}</section>
      <div className="mt-5 rounded-lg border border-zinc-200 bg-white p-4"><div className="flex gap-3"><BadgeCheck className="shrink-0 text-emerald-700" size={20} /><div><p className="text-sm font-black text-zinc-950">Admin security baseline</p><p className="mt-1 text-xs font-medium leading-5 text-zinc-500">MFA is required, permissions are checked by Supabase, audit events are immutable, and service-role credentials never enter the browser.</p></div></div></div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
    </>
  );
}
