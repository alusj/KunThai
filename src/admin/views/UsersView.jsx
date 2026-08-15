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
  LoaderCircle,
  Mail,
  MoreHorizontal,
  Search,
  ShieldCheck,
  ShoppingBag,
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
import { showToast } from "../../Backend/services/toastService";

const PAGE_SIZE = 25;

const EMPTY_WORKSPACE = {
  user: null,
  wallet: { balance: 0, lifetime_earned: 0, lifetime_spent: 0 },
  transactions: [],
  cases: [],
  content: [],
  audit: [],
  summary: { content_count: 0, case_count: 0, open_case_count: 0 },
};

function statusTone(status) {
  if (!status || status === "active") return "bg-emerald-50 text-emerald-800";
  if (status === "warned") return "bg-amber-50 text-amber-800";
  if (status === "restricted") return "bg-orange-50 text-orange-800";
  return "bg-red-50 text-red-700";
}

function UserAvatar({ user, size = "h-10 w-10", textSize = "text-sm" }) {
  if (user.avatar_url) return <img src={user.avatar_url} alt="" className={`${size} shrink-0 rounded-lg bg-zinc-100 object-cover`} />;
  return <span className={`grid ${size} shrink-0 place-items-center rounded-lg bg-zinc-100 ${textSize} font-black text-zinc-700`}>{(user.display_name || user.email || "U").slice(0, 1).toUpperCase()}</span>;
}

function UserActionsMenu({ user, access, onOpen, onNotify }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const canManage = access.permissions.includes("users.manage");
  const canNotify = access.permissions.includes("notifications.manage") && Boolean(user.email);
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
      showToast("User ID copied.", "success", { title: "Users" });
    } catch {
      showToast(user.user_id, "info", { title: "Copy this user ID" });
    }
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button type="button" aria-label={`Actions for ${user.display_name || user.email || "user"}`} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="grid h-9 w-9 place-items-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-emerald-500">
        <MoreHorizontal size={18} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-11 z-30 w-64 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-xl">
          <p className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-400">Inspect</p>
          <MenuButton icon={UserRound} label="View user overview" onClick={() => choose("overview")} />
          <MenuButton icon={ShoppingBag} label="View content" onClick={() => choose("content")} />
          <MenuButton icon={FileText} label="Cases and reports" onClick={() => choose("cases")} />
          <MenuButton icon={CircleDollarSign} label="Visibility Credits" onClick={() => choose("credits")} />
          {canAudit ? <MenuButton icon={History} label="Admin history" onClick={() => choose("history")} /> : null}
          <div className="my-1 border-t border-zinc-100" />
          <p className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-400">Actions</p>
          {canNotify ? <MenuButton icon={BellRing} label="Notify user" onClick={() => { setOpen(false); onNotify(); }} /> : null}
          {canManage ? <MenuButton icon={ShieldCheck} label="Account control" onClick={() => choose("security")} /> : null}
          <MenuButton icon={Copy} label="Copy user ID" onClick={copyId} />
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({ icon: Icon, label, onClick }) {
  return <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-bold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950"><Icon size={16} className="text-zinc-400" /> {label}</button>;
}

function VerificationBadge({ verified, children }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-black ${verified ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-500"}`}>{verified ? <Check size={13} /> : null}{children}</span>;
}

function WorkspaceLoading() {
  return <div className="flex items-center gap-2 px-5 py-12 text-sm font-semibold text-zinc-500"><LoaderCircle className="animate-spin" size={18} /> Loading user workspace…</div>;
}

function EmptyPanel({ icon: Icon, title, body }) {
  return <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center"><Icon className="mx-auto text-zinc-300" size={28} /><p className="mt-3 text-sm font-black text-zinc-900">{title}</p><p className="mt-1 text-xs font-medium leading-5 text-zinc-500">{body}</p></div>;
}

function OverviewPanel({ user, workspace }) {
  const details = workspace.user || user;
  const summary = workspace.summary || EMPTY_WORKSPACE.summary;
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Content" value={summary.content_count || workspace.content.length} detail="Across KunThai" icon={ShoppingBag} />
        <MetricCard label="Cases" value={summary.case_count || workspace.cases.length} detail={`${summary.open_case_count || 0} currently open`} icon={FileText} />
        <MetricCard label="Visibility Credits" value={workspace.wallet?.balance || 0} detail="Current wallet balance" icon={CircleDollarSign} />
      </section>
      <section className="rounded-lg border border-zinc-200 p-4">
        <h3 className="text-sm font-black text-zinc-950">Identity and account</h3>
        <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Detail label="Display name" value={details.display_name || "Unnamed account"} />
          <Detail label="Username" value={details.username ? `@${details.username}` : "Not set"} />
          <Detail label="Email" value={details.email || "Not provided"} />
          <Detail label="Phone" value={details.phone || "Not provided"} />
          <Detail label="Account type" value={titleCase(details.account_type || "personal")} />
          <Detail label="Joined" value={formatDateTime(details.created_at)} />
          <Detail label="Last sign-in" value={details.last_sign_in_at ? formatDateTime(details.last_sign_in_at) : "No sign-in recorded"} />
          <Detail label="User ID" value={details.user_id || user.user_id} mono />
        </dl>
      </section>
      <section className="rounded-lg border border-zinc-200 p-4">
        <h3 className="text-sm font-black text-zinc-950">Verification</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <VerificationBadge verified={details.email_verified}>Email {details.email_verified ? "verified" : "not verified"}</VerificationBadge>
          <VerificationBadge verified={details.phone_verified}>Phone {details.phone_verified ? "verified" : "not verified"}</VerificationBadge>
          <VerificationBadge verified={details.profile_verified}>Profile {details.profile_verified ? "verified" : "not verified"}</VerificationBadge>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon }) {
  return <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-center justify-between"><p className="text-[11px] font-black uppercase text-zinc-500">{label}</p><Icon size={16} className="text-zinc-400" /></div><p className="mt-3 text-2xl font-black text-zinc-950">{value ?? 0}</p><p className="mt-1 text-xs font-semibold text-zinc-500">{detail}</p></article>;
}

function Detail({ label, value, mono = false }) {
  return <div><dt className="text-[10px] font-black uppercase tracking-wide text-zinc-400">{label}</dt><dd className={`mt-1 break-words text-sm font-bold text-zinc-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd></div>;
}

function ContentPanel({ content }) {
  const sorted = useMemo(() => [...content].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)), [content]);
  if (!sorted.length) return <EmptyPanel icon={ShoppingBag} title="No content found" body="This user has no Explore posts, UrMall records, or Transport profiles available to this admin scope." />;
  return (
    <div className="space-y-3">
      {sorted.map((item, index) => (
        <article key={`${item.surface}-${item.id}-${index}`} className="flex gap-3 rounded-lg border border-zinc-200 p-3">
          {item.media_url ? <img src={item.media_url} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-zinc-100 object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-400"><ShoppingBag size={20} /></span>}
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-600">{item.surface === "marketplace" ? "UrMall" : titleCase(item.surface)}</span>{item.status ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800">{titleCase(item.status)}</span> : null}</div><p className="mt-2 truncate text-sm font-black text-zinc-950">{item.title || titleCase(item.type || "Content")}</p><p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-zinc-500">{item.summary || "No description available."}</p><p className="mt-1 text-[11px] font-semibold text-zinc-400">{formatDateTime(item.created_at)}</p></div>
        </article>
      ))}
    </div>
  );
}

function CasesPanel({ cases }) {
  if (!cases.length) return <EmptyPanel icon={FileText} title="No cases or reports" body="No cases currently identify this account as the subject or reporter." />;
  return (
    <div className="space-y-3">
      {cases.map((item) => <article key={item.id} className="rounded-lg border border-zinc-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black text-emerald-700">{formatCaseNumber(item.case_number)}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${["resolved", "closed"].includes(item.status) ? "bg-zinc-100 text-zinc-600" : "bg-amber-50 text-amber-800"}`}>{titleCase(item.status)}</span></div><p className="mt-2 text-sm font-black text-zinc-950">{item.title}</p><p className="mt-1 text-xs font-medium leading-5 text-zinc-500">{item.description || titleCase(item.case_type)}</p><p className="mt-2 text-[11px] font-semibold text-zinc-400">{titleCase(item.sector)} · {titleCase(item.queue)} · {formatRelativeTime(item.created_at)}</p></article>)}
    </div>
  );
}

function CreditsPanel({ user, workspace, canGrant, busy, onGrant }) {
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
        <MetricCard label="Balance" value={wallet.balance || 0} detail="Available credits" icon={CircleDollarSign} />
        <MetricCard label="Lifetime earned" value={wallet.lifetime_earned || 0} detail="All credited amounts" icon={Activity} />
        <MetricCard label="Lifetime spent" value={wallet.lifetime_spent || 0} detail="Used for visibility" icon={ShoppingBag} />
      </section>
      {canGrant ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
          <div><h3 className="text-sm font-black text-emerald-950">Grant Visibility Credits</h3><p className="mt-1 text-xs font-medium leading-5 text-emerald-800">Creates a wallet transaction, user notification, and immutable admin audit entry.</p></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[8rem_1fr]">
            <label><span className="mb-1.5 block text-xs font-black text-zinc-600">Amount</span><input type="number" min="1" max="1000" value={amount} onChange={(event) => updateAmount(event.target.value)} className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-black outline-none focus:border-emerald-600" /></label>
            <SuggestedTextSelect label="Suggested grant reasons" suggestions={VISIBILITY_CREDIT_REASON_SUGGESTIONS} onSelect={updateReason} />
          </div>
          <label className="mt-3 block"><span className="mb-1.5 block text-xs font-black text-zinc-600">Required grant reason</span><textarea rows={3} value={reason} onChange={(event) => updateReason(event.target.value)} className="w-full resize-none rounded-lg border border-zinc-300 bg-white p-3 text-sm font-medium outline-none focus:border-emerald-600" placeholder="Explain why this credit grant is appropriate" /></label>
          {confirming ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-black text-amber-950">Confirm {numericAmount} credits for {user.display_name || user.email}</p><p className="mt-1 text-xs font-semibold text-amber-800">Balance will change from {wallet.balance || 0} to {(wallet.balance || 0) + numericAmount}. This action will be audited.</p><div className="mt-3 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setConfirming(false)} className="h-9 rounded-lg px-3 text-xs font-black text-amber-800 hover:bg-amber-100">Cancel</button><button type="button" disabled={busy} onClick={async () => { const granted = await onGrant(numericAmount, reason.trim()); if (granted) { setConfirming(false); setReason(""); } }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-800 px-3 text-xs font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={15} /> : <Check size={15} />} Confirm grant</button></div></div> : <button type="button" disabled={busy || numericAmount < 1 || numericAmount > 1000 || !reason.trim()} onClick={() => setConfirming(true)} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-black text-white hover:bg-emerald-900 disabled:opacity-50"><CircleDollarSign size={16} /> Review grant</button>}
        </section>
      ) : null}
      <section>
        <h3 className="text-sm font-black text-zinc-950">Credit history</h3>
        <div className="mt-3 space-y-2">
          {workspace.transactions.map((item) => <article key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3"><div className="min-w-0"><p className="truncate text-sm font-black text-zinc-900">{titleCase(item.transaction_type)}</p><p className="mt-1 text-xs font-semibold text-zinc-500">{item.metadata?.reason || titleCase(item.surface)} · {formatDateTime(item.created_at)}</p></div><div className="text-right"><p className={`text-sm font-black ${item.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}>{item.amount >= 0 ? "+" : ""}{item.amount}</p><p className="mt-1 text-[10px] font-bold text-zinc-400">Balance {item.balance_after}</p></div></article>)}
          {!workspace.transactions.length ? <EmptyPanel icon={CircleDollarSign} title="No credit activity" body="This wallet does not have any recorded Visibility Credit transactions." /> : null}
        </div>
      </section>
    </div>
  );
}

function AccountSecurityPanel({ user, access, busy, onSaved }) {
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
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-black text-zinc-950">Platform account control</h3><p className="mt-1 text-xs font-medium text-zinc-500">Changes apply across the selected sectors and are recorded in the audit log.</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusTone(user.account_status)}`}>{titleCase(user.account_status || "active")}</span></div>
        {canManage ? <form onSubmit={(event) => { event.preventDefault(); onSaved(form); }} className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-black text-zinc-600">Status</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-bold"><option value="active">Active</option><option value="warned">Warned</option><option value="restricted">Restricted</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select></label><label><span className="mb-1.5 block text-xs font-black text-zinc-600">Expires (optional)</span><input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold" /></label></div>
          {form.status === "restricted" ? <fieldset><legend className="text-xs font-black text-zinc-600">Restricted sectors</legend><div className="mt-2 grid grid-cols-2 gap-2">{ADMIN_SECTORS.map((sector) => <label key={sector.value} className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold"><input type="checkbox" checked={form.sectors.includes(sector.value)} onChange={() => toggleSector(sector.value)} className="accent-emerald-700" />{sector.label}</label>)}</div></fieldset> : null}
          <SuggestedTextSelect label="Suggested account control reasons" suggestions={ACCOUNT_CONTROL_REASON_SUGGESTIONS} onSelect={(text) => setForm((current) => ({ ...current, reason: text }))} />
          <label className="block"><span className="mb-1.5 block text-xs font-black text-zinc-600">Required reason</span><textarea required rows={3} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className="w-full resize-none rounded-lg border border-zinc-300 p-3 text-sm font-medium outline-none focus:border-emerald-600" /></label>
          <button type="submit" disabled={busy || !form.reason.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800 disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <ShieldCheck size={16} />} Apply account control</button>
        </form> : <p className="mt-4 text-sm font-medium text-zinc-500">Your role can inspect this account but cannot change account access.</p>}
      </section>
      <section className="rounded-lg border border-zinc-200 p-4"><h3 className="text-sm font-black text-zinc-950">Security status</h3><div className="mt-3 flex flex-wrap gap-2"><VerificationBadge verified={user.email_verified}>Email {user.email_verified ? "verified" : "not verified"}</VerificationBadge><VerificationBadge verified={user.phone_verified}>Phone {user.phone_verified ? "verified" : "not verified"}</VerificationBadge></div><p className="mt-4 text-xs font-medium leading-5 text-zinc-500">Password resets, session revocation, impersonation, and account deletion are intentionally not exposed as quick actions. Those operations require dedicated security or case-based workflows.</p></section>
    </div>
  );
}

function HistoryPanel({ audit }) {
  if (!audit.length) return <EmptyPanel icon={History} title="No administrative history" body="No recorded admin action currently targets this user." />;
  return <div className="space-y-3">{audit.map((item) => <article key={item.id} className="rounded-lg border border-zinc-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black text-zinc-950">{titleCase(item.action_key?.replaceAll(".", " "))}</p><span className="text-[11px] font-semibold text-zinc-400">{formatRelativeTime(item.created_at)}</span></div><p className="mt-2 text-xs font-medium leading-5 text-zinc-600">{item.reason || "No reason recorded."}</p><p className="mt-2 text-[10px] font-black uppercase text-zinc-400">{titleCase(item.sector || "platform")}</p></article>)}</div>;
}

function UserWorkspaceDrawer({ user, initialTab, access, onClose, onUserUpdated }) {
  const [tab, setTab] = useState(initialTab || "overview");
  const [workspace, setWorkspace] = useState(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canGrant = access.permissions.includes("visibility_credits.manage");
  const tabs = [
    { id: "overview", label: "Overview", icon: UserRound },
    { id: "content", label: "Content", icon: ShoppingBag },
    { id: "cases", label: "Cases", icon: FileText },
    { id: "credits", label: "Credits", icon: CircleDollarSign },
    { id: "security", label: "Account", icon: ShieldCheck },
    ...(access.permissions.includes("audit.view") ? [{ id: "history", label: "History", icon: History }] : []),
  ];

  async function loadWorkspace(quiet = false) {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const value = await getAdminUserWorkspace(user.user_id);
      setWorkspace({ ...EMPTY_WORKSPACE, ...(value || {}), user: { ...user, ...(value?.user || {}) } });
    } catch (nextError) {
      setError(nextError.message || "Unable to load this user workspace.");
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
      showToast("Account control updated.", "success", { title: currentUser.display_name || "User" });
    } catch (nextError) { setError(nextError.message || "Unable to update account control."); }
    finally { setBusy(false); }
  }

  async function grantCredits(amount, reason) {
    setBusy(true); setError("");
    try {
      const result = await grantAdminVisibilityCredits({ userId: user.user_id, amount, reason });
      await loadWorkspace(true);
      showToast(`${result.amount || amount} Visibility Credits granted.`, "success", { title: currentUser.display_name || "User" });
      return true;
    } catch (nextError) { setError(nextError.message || "Unable to grant Visibility Credits."); return false; }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[75]">
      <button type="button" aria-label="Close user workspace" onClick={onClose} className="absolute inset-0 bg-zinc-950/45" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-white shadow-2xl">
        <header className="flex min-h-20 items-center justify-between gap-3 border-b border-zinc-200 px-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><UserAvatar user={currentUser} size="h-11 w-11" textSize="text-base" /><div className="min-w-0"><p className="truncate text-base font-black text-zinc-950">{currentUser.display_name || "Unnamed account"}</p><p className="mt-1 truncate text-xs font-semibold text-zinc-500">{currentUser.email || currentUser.phone || "No contact information"}</p></div></div><button type="button" title="Close" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"><X size={20} /></button></header>
        <nav aria-label="User workspace sections" className="kuntai-scrollbar-none flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 px-3 py-2 sm:px-5">{tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-black ${tab === item.id ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}><item.icon size={15} />{item.label}</button>)}</nav>
        <div className="kuntai-scrollbar-none flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? <WorkspaceLoading /> : null}
          {!loading && tab === "overview" ? <OverviewPanel user={currentUser} workspace={workspace} /> : null}
          {!loading && tab === "content" ? <ContentPanel content={workspace.content || []} /> : null}
          {!loading && tab === "cases" ? <CasesPanel cases={workspace.cases || []} /> : null}
          {!loading && tab === "credits" ? <CreditsPanel user={currentUser} workspace={workspace} canGrant={canGrant} busy={busy} onGrant={grantCredits} /> : null}
          {!loading && tab === "security" ? <AccountSecurityPanel user={currentUser} access={access} busy={busy} onSaved={saveControl} /> : null}
          {!loading && tab === "history" ? <HistoryPanel audit={workspace.audit || []} /> : null}
        </div>
        {error ? <div role="alert" className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:px-6">{error}</div> : null}
      </aside>
    </div>
  );
}

function TargetedNotificationDialog({ user, onClose }) {
  const [form, setForm] = useState({ title: "", body: "", sector: "platform", priority: "normal" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await createNotificationCampaign({ ...form, audience: "specific_users", filter: { emails: [user.email] }, schedule: "" });
      showToast("Targeted notification campaign created.", "success", { title: user.display_name || user.email });
      onClose();
    } catch (nextError) { setError(nextError.message || "Unable to create this notification."); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4"><button type="button" aria-label="Close notification composer" className="absolute inset-0 bg-zinc-950/55" onClick={onClose} /><form onSubmit={submit} className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-emerald-700">Targeted notification</p><h2 className="mt-1 text-xl font-black text-zinc-950">Notify {user.display_name || user.email}</h2><p className="mt-1 text-xs font-semibold text-zinc-500">Creates an auditable campaign for {user.email}.</p></div><button type="button" title="Close" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"><X size={19} /></button></div>
      <div className="mt-5 space-y-4"><div className="space-y-3"><SuggestedTextSelect label="Suggested notification titles" suggestions={NOTIFICATION_TITLE_SUGGESTIONS} onSelect={(text) => setForm((current) => ({ ...current, title: text }))} /><label className="block"><span className="mb-1.5 block text-sm font-bold">Title</span><input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-semibold outline-none focus:border-emerald-600" /></label></div><div className="space-y-3"><SuggestedTextSelect label="Suggested notification messages" suggestions={NOTIFICATION_MESSAGE_SUGGESTIONS} onSelect={(text) => setForm((current) => ({ ...current, body: text }))} /><label className="block"><span className="mb-1.5 block text-sm font-bold">Message</span><textarea required rows={5} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} className="w-full resize-none rounded-lg border border-zinc-300 p-3 text-sm font-medium outline-none focus:border-emerald-600" /></label></div><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-black text-zinc-600">Sector</span><select value={form.sector} onChange={(event) => setForm((current) => ({ ...current, sector: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-bold"><option value="platform">Platform</option><option value="explore">Explore</option><option value="marketplace">UrMall</option><option value="transport">Transport</option></select></label><label><span className="mb-1.5 block text-xs font-black text-zinc-600">Priority</span><select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-bold"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></div></div>
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-10 rounded-lg border border-zinc-300 px-4 text-sm font-black text-zinc-700">Cancel</button><button type="submit" disabled={busy || !form.title.trim() || !form.body.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Mail size={16} />} Create campaign</button></div></form></div>
  );
}

export default function UsersView({ access }) {
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
        .catch((nextError) => { if (active) setError(nextError.message || "Unable to search users."); })
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
      <header className="mb-6"><p className="text-xs font-black uppercase text-emerald-700">Platform directory</p><h1 className="mt-1 text-2xl font-black text-zinc-950 sm:text-3xl">Users</h1><p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-zinc-600">Inspect identities, content, cases, account access, and Visibility Credits from one permission-aware workspace.</p></header>
      <section className="mb-4 grid gap-3 rounded-lg border border-zinc-200 bg-white p-3 lg:grid-cols-[minmax(18rem,1fr)_repeat(3,minmax(9rem,auto))]">
        <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, username, email, or phone" className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-10 pr-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100" /></label>
        <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700"><option value="all">All statuses</option><option value="active">Active</option><option value="warned">Warned</option><option value="restricted">Restricted</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select>
        <select aria-label="Filter by account type" value={accountType} onChange={(event) => setAccountType(event.target.value)} className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700"><option value="all">All account types</option><option value="personal">Personal</option><option value="business">Business</option><option value="operator">Operator</option><option value="company">Company</option></select>
        <select aria-label="Sort users" value={sort} onChange={(event) => setSort(event.target.value)} className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="last_active">Recently active</option></select>
      </section>
      <section className="overflow-visible border-y border-zinc-200 bg-white sm:rounded-lg sm:border">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_10rem_8rem_9rem_3rem] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-zinc-500 md:grid"><span>User</span><span>Account type</span><span>Status</span><span>Joined</span><span className="sr-only">Actions</span></div>
        {loading ? <div className="flex items-center gap-2 px-5 py-10 text-sm font-semibold text-zinc-500"><LoaderCircle className="animate-spin" size={18} /> Loading users…</div> : null}
        {!loading ? users.map((item) => (
          <article key={item.user_id} className="grid gap-3 border-b border-zinc-100 px-4 py-4 last:border-0 md:grid-cols-[minmax(0,1.4fr)_10rem_8rem_9rem_3rem] md:items-center">
            <button type="button" onClick={() => openUser(item)} className="flex min-w-0 items-center gap-3 text-left"><UserAvatar user={item} /><span className="min-w-0"><span className="block truncate text-sm font-black text-zinc-950">{item.display_name || "Unnamed account"}</span><span className="mt-1 block truncate text-xs font-medium text-zinc-500">{item.email || item.phone || "No contact information"} {item.username ? `· @${item.username}` : ""}</span></span></button>
            <span className="w-fit rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-black text-zinc-700">{titleCase(item.account_type || "personal")}</span>
            <span className={`w-fit rounded-full px-2 py-1 text-[11px] font-black ${statusTone(item.account_status)}`}>{titleCase(item.account_status || "active")}</span>
            <span className="text-xs font-semibold text-zinc-400">{formatRelativeTime(item.created_at)}</span>
            <UserActionsMenu user={item} access={access} onOpen={(tab) => openUser(item, tab)} onNotify={() => setNotificationUser(item)} />
          </article>
        )) : null}
        {!loading && !users.length ? <div className="px-5 py-12 text-center"><UserRound className="mx-auto text-zinc-300" size={30} /><p className="mt-3 text-sm font-black text-zinc-900">No matching users</p><p className="mt-1 text-xs font-medium text-zinc-500">Try a different search or filter.</p></div> : null}
      </section>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs font-bold text-zinc-500">{total ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total} users` : "0 users"}</p><div className="flex items-center gap-2"><button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-300 px-3 text-xs font-black text-zinc-700 disabled:opacity-40"><ChevronLeft size={15} /> Previous</button><span className="px-2 text-xs font-black text-zinc-500">Page {page + 1} of {pageCount}</span><button type="button" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((value) => value + 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-300 px-3 text-xs font-black text-zinc-700 disabled:opacity-40">Next <ChevronRight size={15} /></button></div></div>
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {selected ? <UserWorkspaceDrawer user={selected.user} initialTab={selected.tab} access={access} onClose={() => setSelected(null)} onUserUpdated={updateSelectedUser} /> : null}
      {notificationUser ? <TargetedNotificationDialog user={notificationUser} onClose={() => setNotificationUser(null)} /> : null}
    </>
  );
}
