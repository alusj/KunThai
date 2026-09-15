import {
  Activity,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Crown,
  Gauge,
  KeyRound,
  MapPin,
  Package,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react";
import { formatDateTime, formatRelativeTime, titleCase } from "../adminConfig";

const EMPTY_SUMMARY = {
  account_count: 1,
  business_count: 0,
  company_count: 0,
  operator_count: 0,
  fleet_count: 0,
  rental_count: 0,
  product_count: 0,
  subscription_count: 0,
  admin_role_count: 0,
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function StatusPill({ value, tone }) {
  const normalized = String(value || "active").toLowerCase();
  const classes = tone || (normalized.includes("reject") || normalized.includes("suspend") || normalized.includes("ban")
    ? "bg-red-50 text-red-700"
    : normalized.includes("pending") || normalized.includes("warn") || normalized.includes("grace")
      ? "bg-amber-50 text-amber-800"
      : normalized.includes("expired") || normalized.includes("cancel") || normalized.includes("offline")
        ? "bg-zinc-100 text-zinc-600"
        : "bg-emerald-50 text-emerald-800");
  return <span className={`inline-flex w-fit items-center rounded-full px-2 py-1 text-[10px] font-black ${classes}`}>{titleCase(String(value || "active").replaceAll("_", " "))}</span>;
}

function Panel({ title, detail, icon: Icon, children, className = "" }) {
  return <section className={`rounded-xl border border-zinc-200 bg-white p-4 shadow-sm ${className}`}><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon size={17} /></span><div><h3 className="text-sm font-black text-zinc-950">{title}</h3>{detail ? <p className="mt-1 text-xs font-medium leading-5 text-zinc-500">{detail}</p> : null}</div></div></div><div className="mt-4">{children}</div></section>;
}

function Metric({ label, value, detail, icon: Icon, tone = "text-zinc-950" }) {
  return <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{label}</p><Icon size={15} className="text-zinc-400" /></div><p className={`mt-2 text-2xl font-black ${tone}`}>{numberValue(value).toLocaleString()}</p>{detail ? <p className="mt-1 text-[11px] font-semibold leading-4 text-zinc-500">{detail}</p> : null}</article>;
}

function Detail({ label, value, mono = false }) {
  return <div><dt className="text-[10px] font-black uppercase tracking-wide text-zinc-400">{label}</dt><dd className={`mt-1 break-words text-sm font-bold text-zinc-800 ${mono ? "font-mono text-xs" : ""}`}>{value || "Not recorded"}</dd></div>;
}

function Verification({ user }) {
  const checks = [
    ["Email", user.email_verified],
    ["Phone", user.phone_verified],
    ["Profile", user.profile_verified],
    ["Platform ID", Boolean(user.public_id)],
  ];
  return <div className="flex flex-wrap gap-2">{checks.map(([label, verified]) => <span key={label} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-black ${verified ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-500"}`}>{verified ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{label} {verified ? "verified" : "not verified"}</span>)}</div>;
}

function AccountCard({ item, kind, icon: Icon }) {
  const title = item.name || item.business_name || item.company_name || item.full_name || item.label || titleCase(kind);
  const role = item.role || (kind === "business" ? "owner" : kind === "company" ? "owner" : "solo operator");
  const plan = item.plan_name || item.plan_code;
  return <article className="rounded-xl border border-zinc-200 p-3 transition hover:border-emerald-300 hover:shadow-sm"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500"><Icon size={17} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black text-zinc-950">{title}</p>{item.status ? <StatusPill value={item.status} /> : null}</div><p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">{titleCase(role.replaceAll("_", " "))} · {titleCase(kind)}</p>{item.country || item.city ? <p className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-500"><MapPin size={12} />{[item.city, item.country].filter(Boolean).join(", ")}</p> : null}</div></div><div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-zinc-600">{plan ? <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-800">{titleCase(String(plan))} plan</span> : null}{item.verification_status ? <StatusPill value={item.verification_status} /> : null}{item.public_id ? <span className="rounded-full bg-zinc-100 px-2 py-1 font-mono text-zinc-600">{item.public_id}</span> : null}</div></article>;
}

function UsageBar({ label, used, limit }) {
  const numericUsed = numberValue(used);
  const numericLimit = limit === null || limit === undefined ? null : numberValue(limit);
  const percentage = numericLimit === null || numericLimit === 0 ? 0 : Math.min(100, Math.round((numericUsed / numericLimit) * 100));
  return <div><div className="flex justify-between gap-3 text-[11px] font-bold text-zinc-600"><span>{label}</span><span>{numericUsed.toLocaleString()} / {numericLimit === null ? "Unlimited" : numericLimit.toLocaleString()}</span></div>{numericLimit !== null ? <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full rounded-full ${percentage >= 90 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${percentage}%` }} /></div> : null}</div>;
}

export function IdentityOverviewPanel({ user, workspace }) {
  const summary = { ...EMPTY_SUMMARY, ...(workspace.summary || {}) };
  const businesses = asArray(workspace.businesses);
  const companies = asArray(workspace.companies || workspace.mobility?.companies);
  const operators = asArray(workspace.operators || workspace.mobility?.operators);
  const adminRoles = asArray(workspace.admin_roles);
  const attention = [
    ...businesses.filter((item) => ["pending", "rejected", "suspended"].includes(String(item.verification_status || item.status).toLowerCase())),
    ...companies.filter((item) => ["pending", "rejected", "suspended"].includes(String(item.verification_status || item.status).toLowerCase())),
    ...operators.filter((item) => ["pending", "rejected", "suspended"].includes(String(item.verification_status || item.status).toLowerCase())),
  ];
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Linked accounts" value={summary.account_count} detail="Personal, business, company, and operator" icon={UsersRound} />
      <Metric label="UrMall products" value={summary.product_count} detail={`${numberValue(summary.business_count)} business account${numberValue(summary.business_count) === 1 ? "" : "s"}`} icon={ShoppingBag} tone="text-emerald-700" />
      <Metric label="UrRide fleets" value={summary.fleet_count} detail={`${numberValue(summary.rental_count)} rental · ${numberValue(summary.company_count)} compan${numberValue(summary.company_count) === 1 ? "y" : "ies"} · ${numberValue(summary.operator_count)} operator${numberValue(summary.operator_count) === 1 ? "" : "s"}`} icon={Truck} tone="text-sky-700" />
      <Metric label="Subscriptions" value={summary.subscription_count} detail={`${numberValue(summary.admin_role_count)} platform admin role${numberValue(summary.admin_role_count) === 1 ? "" : "s"}`} icon={Crown} tone="text-violet-700" />
    </section>
    {attention.length ? <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><Gauge className="mt-0.5 shrink-0" size={18} /><div><p className="text-sm font-black">Admin attention required</p><p className="mt-1 text-xs font-semibold leading-5">{attention.length} linked account{attention.length === 1 ? "" : "s"} has a pending, rejected, or suspended verification state. Open Accounts, UrMall, or UrRide for the exact record.</p></div></div> : null}
    <Panel title="Identity and platform access" detail="The person behind every linked KunThai account." icon={UserRound}>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Display name" value={user.display_name || "Unnamed account"} /><Detail label="KunThai ID" value={user.public_id || "Generated after account sync"} mono /><Detail label="Username" value={user.username ? `@${user.username}` : "Not set"} /><Detail label="Email" value={user.email || "Not provided"} /><Detail label="Phone" value={user.phone || "Not provided"} /><Detail label="Joined" value={formatDateTime(user.created_at)} /><Detail label="Last sign-in" value={user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : "No sign-in recorded"} /><Detail label="Platform account" value={titleCase(user.account_type || "personal")} /><Detail label="Platform access" value={user.is_admin ? "Administrator" : "Standard user"} /><Detail label="Account status" value={<StatusPill value={user.account_status || "active"} />} /></dl>
      <div className="mt-5 border-t border-zinc-100 pt-4"><p className="mb-2 text-[10px] font-black uppercase tracking-wide text-zinc-400">Verification</p><Verification user={user} /></div>
    </Panel>
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Linked account snapshot" detail="Ownership and management relationships are kept separate." icon={KeyRound}>
        <div className="grid gap-3 sm:grid-cols-2">{businesses.slice(0, 2).map((item) => <AccountCard key={`business-${item.id}`} item={item} kind="business" icon={Building2} />)}{companies.slice(0, 2).map((item) => <AccountCard key={`company-${item.id}`} item={item} kind="company" icon={Truck} />)}{operators.slice(0, 2).map((item) => <AccountCard key={`operator-${item.id}`} item={item} kind="operator" icon={UserRound} />)}{!businesses.length && !companies.length && !operators.length ? <div className="sm:col-span-2"><p className="text-sm font-bold text-zinc-800">Personal account only</p><p className="mt-1 text-xs font-medium leading-5 text-zinc-500">No UrMall business, UrRide company, or operator relationship is linked to this user.</p></div> : null}</div>
      </Panel>
      <Panel title="Platform roles" detail="Administrative access is read-only here; changes remain in Team." icon={ShieldCheck}>
        {adminRoles.length ? <div className="space-y-2">{adminRoles.map((role) => <article key={role.id || role.role_key} className="flex items-start justify-between gap-3 rounded-lg bg-zinc-50 p-3"><div><p className="text-sm font-black text-zinc-900">{role.name || titleCase(role.role_key)}</p><p className="mt-1 text-xs font-semibold text-zinc-500">{asArray(role.sector_scopes).join(", ") || "All sectors"} · Authority {role.authority_level || "—"}</p></div><StatusPill value={role.status || "active"} /></article>)}</div> : <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-center"><ShieldCheck className="mx-auto text-zinc-300" size={24} /><p className="mt-2 text-sm font-black text-zinc-800">Not a platform administrator</p><p className="mt-1 text-xs font-medium text-zinc-500">This user has no active KunThai admin assignment.</p></div>}
      </Panel>
    </div>
    <Panel title="Current plan coverage" detail="Usage is shown against the linked business or company plan." icon={CircleDollarSign}>
      {asArray(workspace.subscriptions).length ? <div className="grid gap-3 lg:grid-cols-2">{asArray(workspace.subscriptions).slice(0, 4).map((item) => <SubscriptionCard key={item.id} item={item} compact />)}</div> : <p className="text-sm font-semibold text-zinc-500">No active UrMall or UrRide subscription is linked to this user.</p>}
    </Panel>
  </div>;
}

export function AccountsPanel({ user, workspace }) {
  const businesses = asArray(workspace.businesses);
  const companies = asArray(workspace.companies || workspace.mobility?.companies);
  const operators = asArray(workspace.operators || workspace.mobility?.operators);
  const roles = asArray(workspace.admin_roles);
  return <div className="space-y-5"><Panel title="All linked accounts" detail="Ownership, delegated access, and service identity in one place." icon={KeyRound}><div className="grid gap-3 lg:grid-cols-2"><AccountCard item={{ name: user.display_name || "Personal account", role: "account holder", status: user.account_status || "active", public_id: user.public_id }} kind="personal" icon={UserRound} />{businesses.map((item) => <AccountCard key={`business-${item.id}`} item={item} kind="business" icon={Building2} />)}{companies.map((item) => <AccountCard key={`company-${item.id}`} item={item} kind="company" icon={Truck} />)}{operators.map((item) => <AccountCard key={`operator-${item.id}`} item={item} kind="operator" icon={UserRound} />)}</div></Panel><Panel title="Platform administrator assignments" detail="Use the Team workspace to grant or revoke access." icon={ShieldCheck}>{roles.length ? <div className="space-y-2">{roles.map((role) => <article key={role.id || role.role_key} className="rounded-lg border border-zinc-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black text-zinc-950">{role.name || titleCase(role.role_key)}</p><StatusPill value={role.status || "active"} /></div><div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-zinc-500"><span>Authority {role.authority_level || "—"}</span><span>·</span><span>{asArray(role.sector_scopes).join(", ") || "All sectors"}</span>{role.expires_at ? <><span>·</span><span>Expires {formatDateTime(role.expires_at)}</span></> : null}</div></article>)}</div> : <p className="text-sm font-semibold text-zinc-500">No active administrator assignments.</p>}</Panel></div>;
}

export function UrMallPanel({ workspace }) {
  const businesses = asArray(workspace.businesses);
  if (!businesses.length) return <EmptyState icon={ShoppingBag} title="No UrMall account" body="This user is not currently linked to an UrMall business or delegated seller dashboard." />;
  return <div className="space-y-5">{businesses.map((business) => <Panel key={business.id} title={business.name || business.business_name || "UrMall business"} detail={`${titleCase(business.business_kind || business.business_type || "general")} · ${business.role || "owner"} · ${[business.city, business.country].filter(Boolean).join(", ") || "Location unavailable"}`} icon={ShoppingBag}><div className="flex flex-wrap items-center gap-2"><StatusPill value={business.verification_status || business.status || "active"} />{business.plan_name || business.plan_code ? <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800">{titleCase(business.plan_name || business.plan_code)} plan</span> : null}{business.admin_count !== undefined ? <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-600">{numberValue(business.admin_count)} admin{numberValue(business.admin_count) === 1 ? "" : "s"}</span> : null}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Products" value={business.product_count} detail={`${numberValue(business.published_product_count)} published`} icon={Package} tone="text-emerald-700" /><Metric label="Orders" value={business.order_count} detail="All-time orders" icon={ShoppingBag} /><Metric label="Content" value={business.content_count} detail="Business content records" icon={Activity} /><Metric label="Admins" value={business.admin_count} detail="Accepted business admins" icon={UsersRound} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><UsageBar label="Products" used={business.product_count} limit={business.product_limit} /><UsageBar label="Business admins" used={business.admin_count} limit={business.admin_limit} /></div></Panel>)}</div>;
}

export function UrRidePanel({ workspace }) {
  const companies = asArray(workspace.companies || workspace.mobility?.companies);
  const operators = asArray(workspace.operators || workspace.mobility?.operators);
  if (!companies.length && !operators.length) return <EmptyState icon={Truck} title="No UrRide account" body="This user is not currently linked to a transport company or solo operator profile." />;
  return <div className="space-y-5">{companies.map((company) => <Panel key={company.id} title={company.company_name || company.name || "Transport company"} detail={`${company.role || "owner"} · ${company.company_type || "Transport company"} · ${[company.city, company.country].filter(Boolean).join(", ") || "Location unavailable"}`} icon={Truck}><div className="flex flex-wrap items-center gap-2"><StatusPill value={company.account_status || company.status || "active"} /><StatusPill value={company.verification_status || "pending"} />{company.plan_name || company.plan_code ? <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800">{titleCase(company.plan_name || company.plan_code)} plan</span> : null}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Fleets" value={company.fleet_count} detail={`${numberValue(company.active_fleet_count)} active`} icon={Truck} tone="text-sky-700" /><Metric label="Rental fleets" value={company.rental_fleet_count} detail="UrRide rental vehicles" icon={Gauge} /><Metric label="Operators" value={company.operator_count} detail="Active company operators" icon={UsersRound} /><Metric label="Admins" value={company.admin_count} detail="Owner and admins" icon={ShieldCheck} /><Metric label="Reservations" value={company.reservation_count} detail="Rental reservations" icon={Activity} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><UsageBar label="Vehicles" used={company.fleet_count} limit={company.vehicle_limit} /><UsageBar label="Operators" used={company.operator_count} limit={company.operator_limit} /></div></Panel>)}{operators.map((operator) => <Panel key={operator.id} title={operator.full_name || operator.name || "Solo operator"} detail={`${operator.operator_mode === "solo" ? "Solo operator" : "Company-linked operator"} · ${operator.display_code || operator.public_id || "No operator ID"} · ${operator.city || "Location unavailable"}`} icon={UserRound}><div className="flex flex-wrap items-center gap-2"><StatusPill value={operator.account_status || operator.status || "active"} /><StatusPill value={operator.verification_status || "pending"} />{asArray(operator.service_modes).map((mode) => <span key={mode} className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-800">{titleCase(String(mode).replaceAll("_", " "))}</span>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Vehicles" value={operator.fleet_count} detail="Assigned and personal fleets" icon={Truck} /><Metric label="Companies" value={operator.company_count} detail="Active memberships" icon={Building2} /><Metric label="Completed jobs" value={operator.completed_jobs} detail="Recorded service activity" icon={Activity} /></div></Panel>)}</div>;
}

function SubscriptionCard({ item, compact = false }) {
  const usageRows = [
    ["Products", "product_count", "product_limit"],
    ["Business admins", "admin_count", "admin_limit"],
    ["Vehicles", "fleet_count", "vehicle_limit"],
    ["Operators", "operator_count", "operator_limit"],
  ].filter(([, , limitKey]) => item.limits && Object.prototype.hasOwnProperty.call(item.limits, limitKey));
  return <article className="rounded-xl border border-zinc-200 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-black text-zinc-950">{item.entity_name || titleCase(item.surface || "service")}</p><p className="mt-1 text-xs font-bold text-violet-700">{titleCase(item.plan_name || item.plan_code || "No plan")}</p></div><StatusPill value={item.status || "active"} /></div><div className={`mt-3 grid gap-2 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}><Detail label="Period ends" value={formatDateTime(item.current_period_end)} /><Detail label="Auto renew" value={item.auto_renew ? "Enabled" : "Off"} /><Detail label="Surface" value={titleCase(item.surface || "platform")} /></div>{usageRows.length ? <div className="mt-4 space-y-2">{usageRows.map(([label, usageKey, limitKey]) => <UsageBar key={limitKey} label={label} used={item.usage?.[usageKey]} limit={item.limits[limitKey]} />)}</div> : null}</article>;
}

export function SubscriptionsPanel({ workspace }) {
  const subscriptions = asArray(workspace.subscriptions);
  if (!subscriptions.length) return <EmptyState icon={CircleDollarSign} title="No linked subscriptions" body="UrMall and UrRide plans appear here when this user owns or manages a subscribed business or company." />;
  return <div className="grid gap-4 lg:grid-cols-2">{subscriptions.map((item) => <SubscriptionCard key={item.id} item={item} />)}</div>;
}

export function ActivityPanel({ workspace }) {
  const activity = asArray(workspace.activity || workspace.audit);
  if (!activity.length) return <EmptyState icon={Activity} title="No activity available" body="No scoped activity records are currently available for this user." />;
  return <div className="space-y-3">{activity.map((item, index) => <article key={item.id || `${item.action_key}-${index}`} className="flex gap-3 rounded-xl border border-zinc-200 p-3"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500"><Activity size={15} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black text-zinc-950">{item.title || titleCase(String(item.action_key || item.activity_type || "activity").replaceAll(".", " ").replaceAll("_", " "))}</p><span className="text-[11px] font-semibold text-zinc-400">{formatRelativeTime(item.created_at)}</span></div><p className="mt-1 text-xs font-medium leading-5 text-zinc-600">{item.reason || item.body || item.description || "No additional detail recorded."}</p><p className="mt-2 text-[10px] font-black uppercase tracking-wide text-zinc-400">{titleCase(item.sector || item.surface || "platform")}</p></div></article>)}</div>;
}

function EmptyState({ icon: Icon, title, body }) {
  return <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center"><Icon className="mx-auto text-zinc-300" size={30} /><p className="mt-3 text-sm font-black text-zinc-900">{title}</p><p className="mx-auto mt-1 max-w-md text-xs font-medium leading-5 text-zinc-500">{body}</p></div>;
}
