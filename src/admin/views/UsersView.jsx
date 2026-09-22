import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BellRing,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Copy,
  FileText,
  History,
  KeyRound,
  LoaderCircle,
  Mail,
  MoreHorizontal,
  Search,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { ADMIN_SECTORS, formatCaseNumber, formatDateTime, formatRelativeTime, titleCase } from "../adminConfig";
import {
  ACCOUNT_CONTROL_REASON_SUGGESTIONS,
  NOTIFICATION_MESSAGE_SUGGESTIONS,
  NOTIFICATION_TITLE_SUGGESTIONS,
  VISIBILITY_CREDIT_REASON_SUGGESTIONS,
} from "../adminTextSuggestions";
import {
  createNotificationCampaign,
  getAdminUserWorkspace,
  grantAdminVisibilityCredits,
  searchAdminUsers,
  setAdminUserStatus,
} from "../adminService";
import SuggestedTextSelect from "../components/SuggestedTextSelect";
import {
  AccountsPanel as IdentityAccountsPanel,
  ActivityPanel as IdentityActivityPanel,
  IdentityOverviewPanel,
  UrMallPanel as IdentityUrMallPanel,
  UrRidePanel as IdentityUrRidePanel,
  SubscriptionsPanel as IdentitySubscriptionsPanel,
} from "../components/UserIdentityPanels";
import { showToast } from "../../Backend/services/toastService";
import { t as i18nText } from "../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";

const PAGE_SIZE = 25;

const EMPTY_WORKSPACE = {
  user: null,
  wallet: { balance: 0, lifetime_earned: 0, lifetime_spent: 0 },
  transactions: [],
  cases: [],
  content: [],
  audit: [],
  activity: [],
  accounts: [],
  businesses: [],
  companies: [],
  operators: [],
  subscriptions: [],
  admin_roles: [],
  summary: { content_count: 0, case_count: 0, open_case_count: 0, account_count: 1, business_count: 0, company_count: 0, operator_count: 0, fleet_count: 0, rental_count: 0, product_count: 0, subscription_count: 0, admin_role_count: 0 },
};

function statusTone(status) {
  if (!status || status === "active") return "bg-emerald-50 text-emerald-800";
  if (status === "warned") return "bg-amber-50 text-amber-800";
  if (status === "restricted") return "bg-orange-50 text-orange-800";
  return "bg-red-50 text-red-700";
}

function UserAvatar({ user, size = "h-10 w-10", textSize = "text-sm" }) {
  useUiLocale();
  if (user.avatar_url) return <img src={user.avatar_url} alt="" className={`${size} shrink-0 rounded-lg bg-zinc-100 object-cover`} />;
  return <span className={`grid ${size} shrink-0 place-items-center rounded-lg bg-zinc-100 ${textSize} font-black text-zinc-700`}>{(user.display_name || user.email || "U").slice(0, 1).toUpperCase()}</span>;
}

function UserActionsMenu({ user, access, onOpen, onNotify }) {
  useUiLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const canManage = access.permissions.includes("users.manage");
  const canNotify = access.permissions.includes("notifications.manage") && Boolean(user.user_id);
  const canAudit = access.permissions.includes("audit.view");

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const closeOnEscape = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function choose(tab) {
    setOpen(false);
    onOpen(tab);
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(user.user_id);
      showToast(i18nText("ui.literals.k4ade027fc571"), "success", { title: i18nText("ui.literals.k57f2b181d0a5") });
    } catch {
      showToast("Couldn't copy user ID", "info", { title: i18nText("ui.literals.kddd25d1456c0") });
    }
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button type="button" aria-label={i18nText("ui.literals.k85a9ad950324", { value0: user.display_name || user.email || "user" })} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="grid h-9 w-9 place-items-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-emerald-500">
        <MoreHorizontal size={18} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-11 z-30 w-64 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-xl">
          <p className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-400">{i18nText("ui.literals.k18ca87afec42")}</p>
          <MenuButton icon={UserRound} label={i18nText("ui.literals.kf9397a16204e")} onClick={() => choose("overview")} />
          <MenuButton icon={ShoppingBag} label={i18nText("ui.literals.k93a77c8b4d1d")} onClick={() => choose("content")} />
          <MenuButton icon={FileText} label={i18nText("ui.literals.k5d79bf6cfca7")} onClick={() => choose("cases")} />
          <MenuButton icon={CircleDollarSign} label="Visibility Credits" onClick={() => choose("credits")} />
          {canAudit ? <MenuButton icon={History} label={i18nText("ui.literals.k2efac77229ce")} onClick={() => choose("history")} /> : null}
          <div className="my-1 border-t border-zinc-100" />
          <p className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-400">{i18nText("ui.literals.kc3cd636a585b")}</p>
          {canNotify ? <MenuButton icon={BellRing} label={i18nText("ui.literals.k50b68f0c4403")} onClick={() => { setOpen(false); onNotify(); }} /> : null}
          {canManage ? <MenuButton icon={ShieldCheck} label={i18nText("ui.literals.k0a005fdd70a9")} onClick={() => choose("security")} /> : null}
          <MenuButton icon={Copy} label={i18nText("ui.literals.k6fff306b9d42")} onClick={copyId} />
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({ icon: Icon, label, onClick }) {
  useUiLocale();
  return <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-bold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950"><Icon size={16} className="text-zinc-400" /> {translateUi(label)}</button>;
}

function VerificationBadge({ verified, children }) {
  useUiLocale();
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-black ${verified ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-500"}`}>{verified ? <Check size={13} /> : null}{children}</span>;
}

function WorkspaceLoading() {
  useUiLocale();
  return <div className="flex items-center gap-2 px-5 py-12 text-sm font-semibold text-zinc-500"><LoaderCircle className="animate-spin" size={18} /> {i18nText("ui.literals.kb50395ee451c")}</div>;
}

function EmptyPanel({ icon: Icon, title, body }) {
  useUiLocale();
  return <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center"><Icon className="mx-auto text-zinc-300" size={28} /><p className="mt-3 text-sm font-black text-zinc-900">{translateUi(title)}</p><p className="mt-1 text-xs font-medium leading-5 text-zinc-500">{body}</p></div>;
}

function OverviewPanel({ user, workspace }) {
  useUiLocale();
  return <IdentityOverviewPanel user={workspace.user || user} workspace={workspace} />;
}

function MetricCard({ label, value, detail, icon: Icon }) {
  useUiLocale();
  return <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-center justify-between"><p className="text-[11px] font-black uppercase text-zinc-500">{translateUi(label)}</p><Icon size={16} className="text-zinc-400" /></div><p className="mt-3 text-2xl font-black text-zinc-950">{value ?? 0}</p><p className="mt-1 text-xs font-semibold text-zinc-500">{translateUi(detail)}</p></article>;
}

function Detail({ label, value, mono = false }) {
  useUiLocale();
  return <div><dt className="text-[10px] font-black uppercase tracking-wide text-zinc-400">{translateUi(label)}</dt><dd className={`mt-1 break-words text-sm font-bold text-zinc-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd></div>;
}

function ContentPanel({ content }) {
  useUiLocale();
  const sorted = useMemo(() => [...content].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)), [content]);
  if (!sorted.length) return <EmptyPanel icon={ShoppingBag} title={i18nText("ui.literals.kd0cf35697c6e")} body="This user has no Explore posts, UrMall records, or Transport profiles available to this admin scope." />;
  return (
    <div className="space-y-3">
      {sorted.map((item, index) => (
        <article key={`${item.surface}-${item.id}-${index}`} className="flex gap-3 rounded-lg border border-zinc-200 p-3">
          {item.media_url ? <img src={item.media_url} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-zinc-100 object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-400"><ShoppingBag size={20} /></span>}
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-600">{item.surface === "marketplace" ? "UrMall" : titleCase(item.surface)}</span>{item.status ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800">{titleCase(item.status)}</span> : null}</div><p className="mt-2 truncate text-sm font-black text-zinc-950">{item.title || titleCase(item.type || i18nText("ui.literals.k4f9be057f0ea"))}</p><p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-zinc-500">{item.summary || i18nText("ui.literals.keb3cdb582202")}</p><p className="mt-1 text-[11px] font-semibold text-zinc-400">{formatDateTime(item.created_at)}</p></div>
        </article>
      ))}
    </div>
  );
}

function CasesPanel({ cases }) {
  useUiLocale();
  if (!cases.length) return <EmptyPanel icon={FileText} title={i18nText("ui.literals.k2f67745fe969")} body="No cases currently identify this account as the subject or reporter." />;
  return (
    <div className="space-y-3">
      {cases.map((item) => <article key={item.id} className="rounded-lg border border-zinc-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black text-emerald-700">{formatCaseNumber(item.case_number)}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${["resolved", "closed"].includes(item.status) ? "bg-zinc-100 text-zinc-600" : "bg-amber-50 text-amber-800"}`}>{titleCase(item.status)}</span></div><p className="mt-2 text-sm font-black text-zinc-950">{item.title}</p><p className="mt-1 text-xs font-medium leading-5 text-zinc-500">{item.description || titleCase(item.case_type)}</p><p className="mt-2 text-[11px] font-semibold text-zinc-400">{titleCase(item.sector)} · {titleCase(item.queue)} · {formatRelativeTime(item.created_at)}</p></article>)}
    </div>
  );
}

function CreditsPanel({ user, workspace, canGrant, busy, onGrant }) {
  useUiLocale();
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const wallet = workspace.wallet || EMPTY_WORKSPACE.wallet;
  const numericAmount = Math.max(0, Number(amount) || 0);

  function updateAmount(value) { setAmount(value); setConfirming(false); }
  function updateReason(value) { setReason(value); setConfirming(false); }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label={i18nText("ui.literals.k90eef613042c")} value={wallet.balance || 0} detail={i18nText("ui.literals.k18001da8d15d")} icon={CircleDollarSign} />
        <MetricCard label={i18nText("ui.literals.k2d6560017458")} value={wallet.lifetime_earned || 0} detail={i18nText("ui.literals.k374640664d7a")} icon={Activity} />
        <MetricCard label={i18nText("ui.literals.ke8063215a81e")} value={wallet.lifetime_spent || 0} detail={i18nText("ui.literals.k70246053b8d8")} icon={ShoppingBag} />
      </section>
      {canGrant ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
          <div><h3 className="text-sm font-black text-emerald-950">{i18nText("ui.literals.kca690a129ef6")}</h3><p className="mt-1 text-xs font-medium leading-5 text-emerald-800">{i18nText("ui.literals.k385b2c8e1631")}</p></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[8rem_1fr]">
            <label><span className="mb-1.5 block text-xs font-black text-zinc-600">{i18nText("ui.literals.k43dc8532f7e5")}</span><input type="number" min="1" max="1000" value={amount} onChange={(event) => updateAmount(event.target.value)} className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-black outline-none focus:border-emerald-600" /></label>
            <SuggestedTextSelect label={i18nText("ui.literals.k5af4d6f0f481")} suggestions={VISIBILITY_CREDIT_REASON_SUGGESTIONS} onSelect={updateReason} />
          </div>
          <label className="mt-3 block"><span className="mb-1.5 block text-xs font-black text-zinc-600">{i18nText("ui.literals.k4f74f2915970")}</span><textarea rows={3} value={reason} onChange={(event) => updateReason(event.target.value)} className="w-full resize-none rounded-lg border border-zinc-300 bg-white p-3 text-sm font-medium outline-none focus:border-emerald-600" placeholder={i18nText("ui.literals.keaf4fca8c142")} /></label>
          {confirming ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-black text-amber-950">{i18nText("ui.literals.k04a212215ef9")} {numericAmount} {i18nText("ui.literals.kbfb9b2844245")} {user.display_name || user.email}</p><p className="mt-1 text-xs font-semibold text-amber-800">{i18nText("ui.literals.k59a2428a43bb")} {wallet.balance || 0} {i18nText("ui.literals.k4374aaee247f")} {(wallet.balance || 0) + numericAmount}{i18nText("ui.literals.k8432c0f680c0")}</p><div className="mt-3 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setConfirming(false)} className="h-9 rounded-lg px-3 text-xs font-black text-amber-800 hover:bg-amber-100">{i18nText("ui.literals.k77dfd2135f4d")}</button><button type="button" disabled={busy} onClick={async () => { const granted = await onGrant(numericAmount, reason.trim()); if (granted) { setConfirming(false); setReason(""); } }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-800 px-3 text-xs font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={15} /> : <Check size={15} />} {i18nText("ui.literals.ke8ecc2e9bacd")}</button></div></div> : <button type="button" disabled={busy || numericAmount < 1 || numericAmount > 1000 || !reason.trim()} onClick={() => setConfirming(true)} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-black text-white hover:bg-emerald-900 disabled:opacity-50"><CircleDollarSign size={16} /> {i18nText("ui.literals.k88f8380fe06a")}</button>}
        </section>
      ) : null}
      <section>
        <h3 className="text-sm font-black text-zinc-950">{i18nText("ui.literals.k01c84647e212")}</h3>
        <div className="mt-3 space-y-2">
          {workspace.transactions.map((item) => <article key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3"><div className="min-w-0"><p className="truncate text-sm font-black text-zinc-900">{titleCase(item.transaction_type)}</p><p className="mt-1 text-xs font-semibold text-zinc-500">{item.metadata?.reason || titleCase(item.surface)} · {formatDateTime(item.created_at)}</p></div><div className="text-right"><p className={`text-sm font-black ${item.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}>{item.amount >= 0 ? "+" : ""}{item.amount}</p><p className="mt-1 text-[10px] font-bold text-zinc-400">{i18nText("ui.literals.k90eef613042c")} {item.balance_after}</p></div></article>)}
          {!workspace.transactions.length ? <EmptyPanel icon={CircleDollarSign} title={i18nText("ui.literals.ke42e348d2192")} body="This wallet does not have any recorded Visibility Credit transactions." /> : null}
        </div>
      </section>
    </div>
  );
}

function AccountSecurityPanel({ user, access, busy, onSaved }) {
  useUiLocale();
  const [form, setForm] = useState({ status: user.account_status || "active", reason: user.status_reason || "", sectors: user.restricted_sectors?.length ? user.restricted_sectors : ["all"], expiresAt: user.status_expires_at ? user.status_expires_at.slice(0, 16) : "" });
  const canManage = access.permissions.includes("users.manage");

  useEffect(() => {
    setForm({ status: user.account_status || "active", reason: user.status_reason || "", sectors: user.restricted_sectors?.length ? user.restricted_sectors : ["all"], expiresAt: user.status_expires_at ? user.status_expires_at.slice(0, 16) : "" });
  }, [user.account_status, user.restricted_sectors, user.status_expires_at, user.status_reason]);

  function toggleSector(value) {
    setForm((current) => {
      if (value === "all") return { ...current, sectors: ["all"] };
      const withoutAll = current.sectors.filter((item) => item !== "all");
      const sectors = withoutAll.includes(value) ? withoutAll.filter((item) => item !== value) : [...withoutAll, value];
      return { ...current, sectors: sectors.length ? sectors : ["all"] };
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-zinc-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-black text-zinc-950">{i18nText("ui.literals.k30469cd0a9f7")}</h3><p className="mt-1 text-xs font-medium text-zinc-500">{i18nText("ui.literals.k4938bf38ebf9")}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusTone(user.account_status)}`}>{titleCase(user.account_status || i18nText("ui.literals.k2bb6b986c5d6"))}</span></div>
        {canManage ? <form onSubmit={(event) => { event.preventDefault(); onSaved(form); }} className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-black text-zinc-600">{i18nText("ui.literals.kbae7d5be7082")}</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-bold"><option value="active">{i18nText("ui.literals.ka733b809d2f1")}</option><option value="warned">{i18nText("ui.literals.k4111e19b1d62")}</option><option value="restricted">{i18nText("ui.literals.kaa2a08d2afa2")}</option><option value="suspended">{i18nText("ui.literals.k794696a72066")}</option><option value="banned">{i18nText("ui.literals.kc8cd83f62e9d")}</option></select></label><label><span className="mb-1.5 block text-xs font-black text-zinc-600">{i18nText("ui.literals.k2316b27368f6")}</span><input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold" /></label></div>
          {form.status === "restricted" ? <fieldset><legend className="text-xs font-black text-zinc-600">{i18nText("ui.literals.k590b1f2f2d1a")}</legend><div className="mt-2 grid grid-cols-2 gap-2">{ADMIN_SECTORS.map((sector) => <label key={sector.value} className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold"><input type="checkbox" checked={form.sectors.includes(sector.value)} onChange={() => toggleSector(sector.value)} className="accent-emerald-700" />{translateUi(sector.label)}</label>)}</div></fieldset> : null}
          <SuggestedTextSelect label={i18nText("ui.literals.ke1085dd6f3b7")} suggestions={ACCOUNT_CONTROL_REASON_SUGGESTIONS} onSelect={(text) => setForm((current) => ({ ...current, reason: text }))} />
          <label className="block"><span className="mb-1.5 block text-xs font-black text-zinc-600">{i18nText("ui.literals.k7573dfb8a544")}</span><textarea required rows={3} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className="w-full resize-none rounded-lg border border-zinc-300 p-3 text-sm font-medium outline-none focus:border-emerald-600" /></label>
          <button type="submit" disabled={busy || !form.reason.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800 disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <ShieldCheck size={16} />} {i18nText("ui.literals.kefad14b0e4b3")}</button>
        </form> : <p className="mt-4 text-sm font-medium text-zinc-500">{i18nText("ui.literals.k5ee05b299ce6")}</p>}
      </section>
      <section className="rounded-lg border border-zinc-200 p-4"><h3 className="text-sm font-black text-zinc-950">{i18nText("ui.literals.kbf0497820deb")}</h3><div className="mt-3 flex flex-wrap gap-2"><VerificationBadge verified={user.email_verified}>{i18nText("ui.literals.k84add5b29527")} {user.email_verified ? i18nText("ui.literals.kec734b651574") : i18nText("ui.literals.kc75397d79fa6")}</VerificationBadge><VerificationBadge verified={user.phone_verified}>{i18nText("ui.literals.k77064d526523")} {user.phone_verified ? i18nText("ui.literals.kec734b651574") : i18nText("ui.literals.kc75397d79fa6")}</VerificationBadge></div><p className="mt-4 text-xs font-medium leading-5 text-zinc-500">{i18nText("ui.literals.k16c2c05a31d2")}</p></section>
    </div>
  );
}

function HistoryPanel({ audit }) {
  useUiLocale();
  if (!audit.length) return <EmptyPanel icon={History} title={i18nText("ui.literals.k60c7a1c9158f")} body="No recorded admin action currently targets this user." />;
  return <div className="space-y-3">{audit.map((item) => <article key={item.id} className="rounded-lg border border-zinc-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black text-zinc-950">{titleCase(item.action_key?.replaceAll(".", " "))}</p><span className="text-[11px] font-semibold text-zinc-400">{formatRelativeTime(item.created_at)}</span></div><p className="mt-2 text-xs font-medium leading-5 text-zinc-600">{item.reason || i18nText("ui.literals.kd50951b3a5d2")}</p><p className="mt-2 text-[10px] font-black uppercase text-zinc-400">{titleCase(item.sector || i18nText("ui.literals.k3c72abbe626f"))}</p></article>)}</div>;
}

function UserWorkspaceDrawer({ user, initialTab, access, onClose, onUserUpdated }) {
  useUiLocale();
  const [tab, setTab] = useState(initialTab || "overview");
  const [workspace, setWorkspace] = useState(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canGrant = access.permissions.includes("visibility_credits.manage");
  const tabs = [
    { id: "overview", label: i18nText("ui.literals.k0efc2e6be4c2"), icon: UserRound },
    { id: "accounts", label: i18nText("ui.literals.kfe4aa186f76a"), icon: KeyRound },
    { id: "urmall", label: "UrMall", icon: ShoppingBag },
    { id: "urride", label: "UrRide", icon: Truck },
    { id: "plans", label: i18nText("ui.literals.k5697fd85adbd"), icon: CircleDollarSign },
    { id: "content", label: i18nText("ui.literals.k4f9be057f0ea"), icon: ShoppingBag },
    { id: "cases", label: i18nText("ui.literals.keccd8c22c736"), icon: FileText },
    { id: "credits", label: i18nText("ui.literals.kbfac50d6424b"), icon: CircleDollarSign },
    { id: "security", label: i18nText("ui.literals.k85dfa32c97d8"), icon: ShieldCheck },
    { id: "activity", label: i18nText("ui.literals.k81c0d915fa6d"), icon: Activity },
    ...(access.permissions.includes("audit.view") ? [{ id: "history", label: i18nText("ui.literals.k90ccd6497400"), icon: History }] : []),
  ];

  async function loadWorkspace(quiet = false) {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const value = await getAdminUserWorkspace(user.user_id);
      setWorkspace({ ...EMPTY_WORKSPACE, ...(value || {}), user: { ...user, ...(value?.user || {}) } });
    } catch (nextError) {
      setError(inlineErrorMessage(nextError, i18nText("ui.literals.k1a1a29d3e0ad")));
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => { loadWorkspace(); }, [user.user_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTab(initialTab || "overview"); }, [initialTab, user.user_id]);
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const currentUser = { ...user, ...(workspace.user || {}) };

  async function saveControl(form) {
    setBusy(true); setError("");
    try {
      const updated = await setAdminUserStatus({ userId: user.user_id, status: form.status, reason: form.reason.trim(), sectors: form.status === "restricted" ? form.sectors : ["all"], expiresAt: form.expiresAt || null });
      const patch = { account_status: updated.status, status_reason: updated.reason, restricted_sectors: updated.restricted_sectors, status_expires_at: updated.expires_at };
      setWorkspace((current) => ({ ...current, user: { ...(current.user || user), ...patch } }));
      onUserUpdated(patch);
      showToast(i18nText("ui.literals.k6cc1cd043d22"), "success", { title: "User" });
    } catch (nextError) { setError(inlineErrorMessage(nextError, i18nText("ui.literals.k4f10a895bd7c"))); }
    finally { setBusy(false); }
  }

  async function grantCredits(amount, reason) {
    setBusy(true); setError("");
    try {
      const result = await grantAdminVisibilityCredits({ userId: user.user_id, amount, reason });
      await loadWorkspace(true);
      showToast(`${result.amount || amount} credits granted`, "success", { title: "User" });
      return true;
    } catch (nextError) { setError(inlineErrorMessage(nextError, i18nText("ui.literals.k7467d3e88c60"))); return false; }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[75]">
      <button type="button" aria-label={i18nText("ui.literals.k7ffa9c5a1efe")} onClick={onClose} className="absolute inset-0 bg-zinc-950/45" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-white shadow-2xl">
        <header className="flex min-h-20 items-center justify-between gap-3 border-b border-zinc-200 px-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><UserAvatar user={currentUser} size="h-11 w-11" textSize="text-base" /><div className="min-w-0"><p className="truncate text-base font-black text-zinc-950">{currentUser.display_name || i18nText("ui.literals.k5c0de372dcf7")}</p><p className="mt-1 truncate text-xs font-semibold text-zinc-500">{currentUser.email || currentUser.phone || i18nText("ui.literals.k43f32b9b9d6c")}</p></div></div><button type="button" title={i18nText("ui.literals.kbbfa773e5a63")} onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"><X size={20} /></button></header>
        <nav aria-label={i18nText("ui.literals.kbe0d5637c8b6")} className="kuntai-scrollbar-none flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 px-3 py-2 sm:px-5">{tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-black ${tab === item.id ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}><item.icon size={15} />{translateUi(item.label)}</button>)}</nav>
        <div className="kuntai-scrollbar-none flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? <WorkspaceLoading /> : null}
          {!loading && tab === "overview" ? <OverviewPanel user={currentUser} workspace={workspace} /> : null}
          {!loading && tab === "accounts" ? <IdentityAccountsPanel user={currentUser} workspace={workspace} /> : null}
          {!loading && tab === "urmall" ? <IdentityUrMallPanel workspace={workspace} /> : null}
          {!loading && tab === "urride" ? <IdentityUrRidePanel workspace={workspace} /> : null}
          {!loading && tab === "plans" ? <IdentitySubscriptionsPanel workspace={workspace} /> : null}
          {!loading && tab === "content" ? <ContentPanel content={workspace.content || []} /> : null}
          {!loading && tab === "cases" ? <CasesPanel cases={workspace.cases || []} /> : null}
          {!loading && tab === "credits" ? <CreditsPanel user={currentUser} workspace={workspace} canGrant={canGrant} busy={busy} onGrant={grantCredits} /> : null}
          {!loading && tab === "security" ? <AccountSecurityPanel user={currentUser} access={access} busy={busy} onSaved={saveControl} /> : null}
          {!loading && tab === "activity" ? <IdentityActivityPanel workspace={workspace} /> : null}
          {!loading && tab === "history" ? <HistoryPanel audit={workspace.audit || []} /> : null}
        </div>
        {error ? <div role="alert" className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:px-6">{translateUi(error)}</div> : null}
      </aside>
    </div>
  );
}

function TargetedNotificationDialog({ user, onClose }) {
  useUiLocale();
  const [form, setForm] = useState({ title: "", body: "", sector: "platform", priority: "normal" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await createNotificationCampaign({ ...form, audience: "specific_users", filter: { userIds: [user.user_id], kunthaiIds: [user.public_id].filter(Boolean) }, schedule: "" });
      showToast("Campaign created", "success", { title: "User" });
      onClose();
    } catch (nextError) { setError(inlineErrorMessage(nextError, i18nText("ui.literals.k4c853733cb02"))); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4"><button type="button" aria-label={i18nText("ui.literals.k2330cf8c206f")} className="absolute inset-0 bg-zinc-950/55" onClick={onClose} /><form onSubmit={submit} className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-emerald-700">{i18nText("ui.literals.k886b316b8922")}</p><h2 className="mt-1 text-xl font-black text-zinc-950">{i18nText("ui.literals.k6c03ee54ad3a")} {user.display_name || user.email}</h2><p className="mt-1 text-xs font-semibold text-zinc-500">{i18nText("ui.literals.k405677e917f0")}</p></div><button type="button" title={i18nText("ui.literals.kbbfa773e5a63")} onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"><X size={19} /></button></div>
      <div className="mt-5 space-y-4"><div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3"><p className="text-xs font-black uppercase tracking-wide text-emerald-800">{i18nText("ui.literals.k93ba146da579")}</p><p className="mt-1 font-mono text-sm font-black text-emerald-950">{user.public_id || i18nText("ui.literals.k8d029ee79238")}</p><p className="mt-1 text-xs font-semibold text-emerald-800">{i18nText("ui.literals.kdb191d592847")}</p></div><div className="space-y-3"><SuggestedTextSelect label={i18nText("ui.literals.k6543d203ae5e")} suggestions={NOTIFICATION_TITLE_SUGGESTIONS} onSelect={(text) => setForm((current) => ({ ...current, title: text }))} /><label className="block"><span className="mb-1.5 block text-sm font-bold">{i18nText("ui.literals.k768e0c1c6957")}</span><input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-semibold outline-none focus:border-emerald-600" /></label></div><div className="space-y-3"><SuggestedTextSelect label={i18nText("ui.literals.k7bc509aec067")} suggestions={NOTIFICATION_MESSAGE_SUGGESTIONS} onSelect={(text) => setForm((current) => ({ ...current, body: text }))} /><label className="block"><span className="mb-1.5 block text-sm font-bold">{i18nText("ui.literals.k68f4145fee7d")}</span><textarea required rows={5} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} className="w-full resize-none rounded-lg border border-zinc-300 p-3 text-sm font-medium outline-none focus:border-emerald-600" /></label></div><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-black text-zinc-600">{i18nText("ui.literals.k39fd2070d41b")}</span><select value={form.sector} onChange={(event) => setForm((current) => ({ ...current, sector: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-bold"><option value="platform">{i18nText("ui.literals.k123a7f2fcc9a")}</option><option value="explore">Explore</option><option value="marketplace">UrMall</option><option value="transport">{i18nText("ui.literals.kc10d76c9a4b8")}</option></select></label><label><span className="mb-1.5 block text-xs font-black text-zinc-600">{i18nText("ui.literals.k886cbff9d9df")}</span><select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-bold"><option value="normal">{i18nText("ui.literals.k45e118d0563e")}</option><option value="high">{i18nText("ui.literals.kb1a5954a483f")}</option><option value="urgent">{i18nText("ui.literals.kecb26f46e394")}</option></select></label></div></div>
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{translateUi(error)}</p> : null}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-10 rounded-lg border border-zinc-300 px-4 text-sm font-black text-zinc-700">{i18nText("ui.literals.k77dfd2135f4d")}</button><button type="submit" disabled={busy || !form.title.trim() || !form.body.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Mail size={16} />} {i18nText("ui.literals.k59812bbcc746")}</button></div></form></div>
  );
}

export default function UsersView({ access }) {
  useUiLocale();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [accountType, setAccountType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [notificationUser, setNotificationUser] = useState(null);

  useEffect(() => { setPage(0); }, [search, status, accountType, sort]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      searchAdminUsers({ search, status, accountType, sort, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
        .then((result) => { if (!active) return; setUsers(result.rows); setTotal(result.total); })
        .catch((nextError) => { if (active) setError(inlineErrorMessage(nextError, i18nText("ui.literals.k38bf920f28fd"))); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accountType, page, search, sort, status]);

  function openUser(user, tab = "overview") { setSelected({ user, tab }); }
  function updateSelectedUser(patch) {
    setUsers((current) => current.map((item) => item.user_id === selected?.user.user_id ? { ...item, ...patch } : item));
    setSelected((current) => current ? { ...current, user: { ...current.user, ...patch } } : current);
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <header className="mb-6"><p className="text-xs font-black uppercase text-emerald-700">{i18nText("ui.literals.k58f0328f00eb")}</p><h1 className="mt-1 text-2xl font-black text-zinc-950 sm:text-3xl">{i18nText("ui.literals.k57f2b181d0a5")}</h1><p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-zinc-600">{i18nText("ui.literals.k1a24d7c959be")}</p></header>
      <section className="mb-4 grid gap-3 rounded-lg border border-zinc-200 bg-white p-3 lg:grid-cols-[minmax(18rem,1fr)_repeat(3,minmax(9rem,auto))]">
        <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={i18nText("ui.literals.k799bfce898e0")} className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-10 pr-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100" /></label>
        <select aria-label={i18nText("ui.literals.kf43653d7faf2")} value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700"><option value="all">{i18nText("ui.literals.k6405179d241b")}</option><option value="active">{i18nText("ui.literals.ka733b809d2f1")}</option><option value="warned">{i18nText("ui.literals.k4111e19b1d62")}</option><option value="restricted">{i18nText("ui.literals.kaa2a08d2afa2")}</option><option value="suspended">{i18nText("ui.literals.k794696a72066")}</option><option value="banned">{i18nText("ui.literals.kc8cd83f62e9d")}</option></select>
        <select aria-label={i18nText("ui.literals.k4dc97a606e2f")} value={accountType} onChange={(event) => setAccountType(event.target.value)} className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700"><option value="all">{i18nText("ui.literals.kec137488beec")}</option><option value="personal">{i18nText("ui.literals.k40f073237966")}</option><option value="business">{i18nText("ui.literals.kd6663dda5fe9")}</option><option value="operator">{i18nText("ui.literals.kd0e687b079fb")}</option><option value="company">{i18nText("ui.literals.k7a1994999d18")}</option></select>
        <select aria-label={i18nText("ui.literals.k6d1ba980e8c3")} value={sort} onChange={(event) => setSort(event.target.value)} className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700"><option value="newest">{i18nText("ui.literals.kf5ec7772ca9b")}</option><option value="oldest">{i18nText("ui.literals.k6a99c65c33fe")}</option><option value="name">{i18nText("ui.literals.k5d3eb2787034")}</option><option value="last_active">{i18nText("ui.literals.kf9f7a0f9510f")}</option></select>
      </section>
      <section className="overflow-visible border-y border-zinc-200 bg-white sm:rounded-lg sm:border">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_10rem_8rem_9rem_3rem] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-zinc-500 md:grid"><span>{i18nText("ui.literals.k9f8a2389a20c")}</span><span>{i18nText("ui.literals.k144b49b7c52c")}</span><span>{i18nText("ui.literals.kbae7d5be7082")}</span><span>{i18nText("ui.literals.k43a1c6266f88")}</span><span className="sr-only">{i18nText("ui.literals.kc3cd636a585b")}</span></div>
        {loading ? <div className="flex items-center gap-2 px-5 py-10 text-sm font-semibold text-zinc-500"><LoaderCircle className="animate-spin" size={18} /> {i18nText("ui.literals.kb6443c996d50")}</div> : null}
        {!loading ? users.map((item) => (
          <article key={item.user_id} className="grid gap-3 border-b border-zinc-100 px-4 py-4 last:border-0 md:grid-cols-[minmax(0,1.4fr)_10rem_8rem_9rem_3rem] md:items-center">
            <button type="button" onClick={() => openUser(item)} className="flex min-w-0 items-center gap-3 text-left"><UserAvatar user={item} /><span className="min-w-0"><span className="block truncate text-sm font-black text-zinc-950">{item.display_name || i18nText("ui.literals.k5c0de372dcf7")}</span><span className="mt-1 block truncate text-xs font-medium text-zinc-500">{item.public_id || item.email || item.phone || i18nText("ui.literals.k43f32b9b9d6c")} {item.username ? `· @${item.username}` : ""}</span></span></button>
            <span className="w-fit rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-black text-zinc-700">{titleCase(item.account_type || i18nText("ui.literals.kdb69db5fb56c"))}</span>
            <span className={`w-fit rounded-full px-2 py-1 text-[11px] font-black ${statusTone(item.account_status)}`}>{titleCase(item.account_status || i18nText("ui.literals.k2bb6b986c5d6"))}</span>
            <span className="text-xs font-semibold text-zinc-400">{formatRelativeTime(item.created_at)}</span>
            <UserActionsMenu user={item} access={access} onOpen={(tab) => openUser(item, tab)} onNotify={() => setNotificationUser(item)} />
          </article>
        )) : null}
        {!loading && !users.length ? <div className="px-5 py-12 text-center"><UserRound className="mx-auto text-zinc-300" size={30} /><p className="mt-3 text-sm font-black text-zinc-900">{i18nText("ui.literals.k03102a31d479")}</p><p className="mt-1 text-xs font-medium text-zinc-500">{i18nText("ui.literals.k4e653834fa3b")}</p></div> : null}
      </section>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs font-bold text-zinc-500">{total ? i18nText("ui.literals.kc407601d5f5b", { value0: page * PAGE_SIZE + 1, value1: Math.min((page + 1) * PAGE_SIZE, total), value2: total }) : i18nText("ui.literals.k9d24e5f3a083")}</p><div className="flex items-center gap-2"><button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-300 px-3 text-xs font-black text-zinc-700 disabled:opacity-40"><ChevronLeft size={15} /> {i18nText("ui.literals.k50f94286ba30")}</button><span className="px-2 text-xs font-black text-zinc-500">{i18nText("ui.literals.kfb06270f7c21")} {page + 1} {i18nText("ui.literals.kde04fa0e29f9")} {pageCount}</span><button type="button" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((value) => value + 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-300 px-3 text-xs font-black text-zinc-700 disabled:opacity-40">{i18nText("ui.literals.kbc981983e7f5")} <ChevronRight size={15} /></button></div></div>
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{translateUi(error)}</p> : null}
      {selected ? <UserWorkspaceDrawer user={selected.user} initialTab={selected.tab} access={access} onClose={() => setSelected(null)} onUserUpdated={updateSelectedUser} /> : null}
      {notificationUser ? <TargetedNotificationDialog user={notificationUser} onClose={() => setNotificationUser(null)} /> : null}
    </>
  );
}
