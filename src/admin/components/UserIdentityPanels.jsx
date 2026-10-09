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
import { t as i18nText } from "../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";

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
  useUiLocale();
  const normalized = String(value || "active").toLowerCase();
  const classes = tone || (normalized.includes("reject") || normalized.includes("suspend") || normalized.includes("ban")
    ? "bg-red-50 text-red-700"
    : normalized.includes("pending") || normalized.includes("warn") || normalized.includes("grace")
      ? "bg-amber-50 text-amber-800"
      : normalized.includes("expired") || normalized.includes("cancel") || normalized.includes("offline")
        ? "bg-zinc-100 text-zinc-600"
        : "bg-emerald-50 text-emerald-800");
  return <span className={`inline-flex w-fit items-center rounded-full px-2 py-1 text-[10px] font-black ${classes}`}>{titleCase(String(value || i18nText("ui.literals.k2bb6b986c5d6")).replaceAll("_", " "))}</span>;
}

function Panel({ title, detail, icon: Icon, children, className = "" }) {
  useUiLocale();
  return <section className={`rounded-xl border border-zinc-200 bg-white p-4 shadow-sm ${className}`}><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon size={17} /></span><div><h3 className="text-sm font-black text-zinc-950">{translateUi(title)}</h3>{detail ? <p className="mt-1 text-xs font-medium leading-5 text-zinc-500">{translateUi(detail)}</p> : null}</div></div></div><div className="mt-4">{children}</div></section>;
}

function Metric({ label, value, detail, icon: Icon, tone = "text-zinc-950" }) {
  useUiLocale();
  return <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{translateUi(label)}</p><Icon size={15} className="text-zinc-400" /></div><p className={`mt-2 text-2xl font-black ${tone}`}>{numberValue(value).toLocaleString()}</p>{detail ? <p className="mt-1 text-[11px] font-semibold leading-4 text-zinc-500">{translateUi(detail)}</p> : null}</article>;
}

function Detail({ label, value, mono = false }) {
  useUiLocale();
  return <div><dt className="text-[10px] font-black uppercase tracking-wide text-zinc-400">{translateUi(label)}</dt><dd className={`mt-1 break-words text-sm font-bold text-zinc-800 ${mono ? "font-mono text-xs" : ""}`}>{value || i18nText("ui.literals.k305cc3649e63")}</dd></div>;
}

function Verification({ user }) {
  useUiLocale();
  const checks = [
    ["Email", user.email_verified],
    ["Phone", user.phone_verified],
    ["Profile", user.profile_verified],
    ["Platform ID", Boolean(user.public_id)],
  ];
  return <div className="flex flex-wrap gap-2">{checks.map(([label, verified]) => <span key={label} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-black ${verified ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-500"}`}>{verified ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{translateUi(label)} {verified ? i18nText("ui.literals.kec734b651574") : i18nText("ui.literals.kc75397d79fa6")}</span>)}</div>;
}

function AccountCard({ item, kind, icon: Icon }) {
  useUiLocale();
  const title = item.name || item.business_name || item.company_name || item.full_name || item.label || titleCase(kind);
  const role = item.role || (kind === "business" ? "owner" : kind === "company" ? "owner" : "solo operator");
  const plan = item.plan_name || item.plan_code;
  return <article className="rounded-xl border border-zinc-200 p-3 transition hover:border-emerald-300 hover:shadow-sm"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500"><Icon size={17} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black text-zinc-950">{translateUi(title)}</p>{item.status ? <StatusPill value={item.status} /> : null}</div><p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">{titleCase(role.replaceAll("_", " "))} · {titleCase(kind)}</p>{item.country || item.city ? <p className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-500"><MapPin size={12} />{[item.city, item.country].filter(Boolean).join(", ")}</p> : null}</div></div><div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-zinc-600">{plan ? <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-800">{titleCase(String(plan))} {i18nText("ui.literals.kbed97175b06e")}</span> : null}{item.verification_status ? <StatusPill value={item.verification_status} /> : null}{item.public_id ? <span className="rounded-full bg-zinc-100 px-2 py-1 font-mono text-zinc-600">{item.public_id}</span> : null}</div></article>;
}

function UsageBar({ label, used, limit }) {
  useUiLocale();
  const numericUsed = numberValue(used);
  const numericLimit = limit === null || limit === undefined ? null : numberValue(limit);
  const percentage = numericLimit === null || numericLimit === 0 ? 0 : Math.min(100, Math.round((numericUsed / numericLimit) * 100));
  return <div><div className="flex justify-between gap-3 text-[11px] font-bold text-zinc-600"><span>{translateUi(label)}</span><span>{numericUsed.toLocaleString()} / {numericLimit === null ? i18nText("ui.literals.kb8bef37b7153") : numericLimit.toLocaleString()}</span></div>{numericLimit !== null ? <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full rounded-full ${percentage >= 90 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${percentage}%` }} /></div> : null}</div>;
}

export function IdentityOverviewPanel({ user, workspace }) {
  useUiLocale();
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
      <Metric label={i18nText("ui.literals.ke7cfc16e378b")} value={summary.account_count} detail={i18nText("ui.literals.kde7137e10e26")} icon={UsersRound} />
      <Metric label={i18nText("ui.literals.k88e49bde8b96")} value={summary.product_count} detail={i18nText("ui.literals.k488e5a07e354", { value0: numberValue(summary.business_count), value1: numberValue(summary.business_count) === 1 ? "" : "s" })} icon={ShoppingBag} tone="text-emerald-700" />
      <Metric label={i18nText("ui.literals.k29fcfdc8f449")} value={summary.fleet_count} detail={i18nText("ui.literals.k4651c81708c7", { value0: numberValue(summary.rental_count), value1: numberValue(summary.company_count), value2: numberValue(summary.company_count) === 1 ? "y" : "ies", value3: numberValue(summary.operator_count), value4: numberValue(summary.operator_count) === 1 ? "" : "s" })} icon={Truck} tone="text-sky-700" />
      <Metric label={i18nText("ui.literals.k5697fd85adbd")} value={summary.subscription_count} detail={i18nText("ui.literals.k62071284e7ce", { value0: numberValue(summary.admin_role_count), value1: numberValue(summary.admin_role_count) === 1 ? "" : "s" })} icon={Crown} tone="text-violet-700" />
    </section>
    {attention.length ? <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><Gauge className="mt-0.5 shrink-0" size={18} /><div><p className="text-sm font-black">{i18nText("ui.literals.k99d12a6cf78b")}</p><p className="mt-1 text-xs font-semibold leading-5">{attention.length} {i18nText("ui.literals.k71ba4d5a8044")}{attention.length === 1 ? "" : "s"} {i18nText("ui.literals.k073ff62b0480")}</p></div></div> : null}
    <Panel title={i18nText("ui.literals.kf056cdbcdc24")} detail={i18nText("ui.literals.k8c98f2b0fecc")} icon={UserRound}>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3"><Detail label={i18nText("ui.literals.kc7874aaa0fab")} value={user.display_name || "Unnamed account"} /><Detail label="KunThai ID" value={user.public_id || "Generated after account sync"} mono /><Detail label={i18nText("ui.literals.k84c29015de33")} value={user.username ? `@${user.username}` : "Not set"} /><Detail label={i18nText("ui.literals.k84add5b29527")} value={user.email || "Not provided"} /><Detail label={i18nText("ui.literals.k77064d526523")} value={user.phone || "Not provided"} /><Detail label={i18nText("ui.literals.k43a1c6266f88")} value={formatDateTime(user.created_at)} /><Detail label={i18nText("ui.literals.k2637334f2973")} value={user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : "No sign-in recorded"} /><Detail label={i18nText("ui.literals.k23ad38cd1cb3")} value={titleCase(user.account_type || "personal")} /><Detail label={i18nText("ui.literals.k0f1bb91c30c4")} value={user.is_admin ? "Administrator" : "Standard user"} /><Detail label={i18nText("ui.literals.k8dd86c6d6c79")} value={<StatusPill value={user.account_status || "active"} />} /></dl>
      <div className="mt-5 border-t border-zinc-100 pt-4"><p className="mb-2 text-[10px] font-black uppercase tracking-wide text-zinc-400">{i18nText("ui.literals.k03128bed9062")}</p><Verification user={user} /></div>
    </Panel>
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel title={i18nText("ui.literals.k814ebfdbfaed")} detail={i18nText("ui.literals.k8306275968ac")} icon={KeyRound}>
        <div className="grid gap-3 sm:grid-cols-2">{businesses.slice(0, 2).map((item) => <AccountCard key={`business-${item.id}`} item={item} kind="business" icon={Building2} />)}{companies.slice(0, 2).map((item) => <AccountCard key={`company-${item.id}`} item={item} kind="company" icon={Truck} />)}{operators.slice(0, 2).map((item) => <AccountCard key={`operator-${item.id}`} item={item} kind="operator" icon={UserRound} />)}{!businesses.length && !companies.length && !operators.length ? <div className="sm:col-span-2"><p className="text-sm font-bold text-zinc-800">{i18nText("ui.literals.kf81a8d462856")}</p><p className="mt-1 text-xs font-medium leading-5 text-zinc-500">{i18nText("ui.literals.ka58f4b0b99c8")}</p></div> : null}</div>
      </Panel>
      <Panel title={i18nText("ui.literals.k7d5eeacffd07")} detail={i18nText("ui.literals.k7b00aa048523")} icon={ShieldCheck}>
        {adminRoles.length ? <div className="space-y-2">{adminRoles.map((role) => <article key={role.id || role.role_key} className="flex items-start justify-between gap-3 rounded-lg bg-zinc-50 p-3"><div><p className="text-sm font-black text-zinc-900">{role.name || titleCase(role.role_key)}</p><p className="mt-1 text-xs font-semibold text-zinc-500">{asArray(role.sector_scopes).join(", ") || i18nText("ui.literals.k3473d884bb86")} {i18nText("ui.literals.k2bc62ce050a2")} {role.authority_level || "—"}</p></div><StatusPill value={role.status || "active"} /></article>)}</div> : <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-center"><ShieldCheck className="mx-auto text-zinc-300" size={24} /><p className="mt-2 text-sm font-black text-zinc-800">{i18nText("ui.literals.k7ba3db9254e1")}</p><p className="mt-1 text-xs font-medium text-zinc-500">{i18nText("ui.literals.k898828074b3c")}</p></div>}
      </Panel>
    </div>
    <Panel title={i18nText("ui.literals.kc8d7102c48d2")} detail={i18nText("ui.literals.k3ac8650cd5aa")} icon={CircleDollarSign}>
      {asArray(workspace.subscriptions).length ? <div className="grid gap-3 lg:grid-cols-2">{asArray(workspace.subscriptions).slice(0, 4).map((item) => <SubscriptionCard key={item.id} item={item} compact />)}</div> : <p className="text-sm font-semibold text-zinc-500">{i18nText("ui.literals.ka78e64ce899a")}</p>}
    </Panel>
  </div>;
}

export function AccountsPanel({ user, workspace }) {
  useUiLocale();
  const businesses = asArray(workspace.businesses);
  const companies = asArray(workspace.companies || workspace.mobility?.companies);
  const operators = asArray(workspace.operators || workspace.mobility?.operators);
  const roles = asArray(workspace.admin_roles);
  return <div className="space-y-5"><Panel title={i18nText("ui.literals.ke838c426ff12")} detail={i18nText("ui.literals.k124622fc4a08")} icon={KeyRound}><div className="grid gap-3 lg:grid-cols-2"><AccountCard item={{ name: user.display_name || "Personal account", role: "account holder", status: user.account_status || "active", public_id: user.public_id }} kind="personal" icon={UserRound} />{businesses.map((item) => <AccountCard key={`business-${item.id}`} item={item} kind="business" icon={Building2} />)}{companies.map((item) => <AccountCard key={`company-${item.id}`} item={item} kind="company" icon={Truck} />)}{operators.map((item) => <AccountCard key={`operator-${item.id}`} item={item} kind="operator" icon={UserRound} />)}</div></Panel><Panel title={i18nText("ui.literals.kb724033b867f")} detail={i18nText("ui.literals.kf20410e830e8")} icon={ShieldCheck}>{roles.length ? <div className="space-y-2">{roles.map((role) => <article key={role.id || role.role_key} className="rounded-lg border border-zinc-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black text-zinc-950">{role.name || titleCase(role.role_key)}</p><StatusPill value={role.status || "active"} /></div><div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-zinc-500"><span>{i18nText("ui.literals.k97a9869cf89f")} {role.authority_level || "—"}</span><span>·</span><span>{asArray(role.sector_scopes).join(", ") || i18nText("ui.literals.k3473d884bb86")}</span>{role.expires_at ? <><span>·</span><span>{i18nText("ui.literals.ka99be3da0c9d")} {formatDateTime(role.expires_at)}</span></> : null}</div></article>)}</div> : <p className="text-sm font-semibold text-zinc-500">{i18nText("ui.literals.kf0df736c67e9")}</p>}</Panel></div>;
}

export function UrMallPanel({ workspace }) {
  useUiLocale();
  const businesses = asArray(workspace.businesses);
  if (!businesses.length) return <EmptyState icon={ShoppingBag} title={i18nText("ui.literals.kf6a293d8b9aa")} body="This user is not currently linked to an UrMall business or delegated seller dashboard." />;
  return <div className="space-y-5">{businesses.map((business) => <Panel key={business.id} title={business.name || business.business_name || i18nText("ui.literals.k6de88328f8ac")} detail={`${titleCase(business.business_kind || business.business_type || "general")} · ${business.role || "owner"} · ${[business.city, business.country].filter(Boolean).join(", ") || "Location unavailable"}`} icon={ShoppingBag}><div className="flex flex-wrap items-center gap-2"><StatusPill value={business.verification_status || business.status || "active"} />{business.plan_name || business.plan_code ? <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800">{titleCase(business.plan_name || business.plan_code)} {i18nText("ui.literals.kbed97175b06e")}</span> : null}{business.admin_count !== undefined ? <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-600">{numberValue(business.admin_count)} {i18nText("ui.literals.kd033e22ae348")}{numberValue(business.admin_count) === 1 ? "" : "s"}</span> : null}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label={i18nText("ui.literals.kfe0a091fdbfb")} value={business.product_count} detail={i18nText("ui.literals.k14b57608f3f3", { value0: numberValue(business.published_product_count) })} icon={Package} tone="text-emerald-700" /><Metric label={i18nText("ui.literals.kcded093321dd")} value={business.order_count} detail={i18nText("ui.literals.k627e49ab8fce")} icon={ShoppingBag} /><Metric label={i18nText("ui.literals.k4f9be057f0ea")} value={business.content_count} detail={i18nText("ui.literals.k2a63fc319592")} icon={Activity} /><Metric label={i18nText("ui.literals.ked6b52430295")} value={business.admin_count} detail={i18nText("ui.literals.keba4b95920cc")} icon={UsersRound} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><UsageBar label={i18nText("ui.literals.kfe0a091fdbfb")} used={business.plan_listing_count ?? business.product_count} limit={business.product_limit} /><UsageBar label={i18nText("ui.literals.kb0f5fae31a3f")} used={business.admin_count} limit={business.admin_limit} /></div></Panel>)}</div>;
}

export function UrRidePanel({ workspace }) {
  useUiLocale();
  const companies = asArray(workspace.companies || workspace.mobility?.companies);
  const operators = asArray(workspace.operators || workspace.mobility?.operators);
  if (!companies.length && !operators.length) return <EmptyState icon={Truck} title={i18nText("ui.literals.k8820348bc6a2")} body="This user is not currently linked to a transport company or solo operator profile." />;
  return <div className="space-y-5">{companies.map((company) => <Panel key={company.id} title={company.company_name || company.name || i18nText("ui.literals.kd19b78e4cb46")} detail={`${company.role || "owner"} · ${company.company_type || "Transport company"} · ${[company.city, company.country].filter(Boolean).join(", ") || "Location unavailable"}`} icon={Truck}><div className="flex flex-wrap items-center gap-2"><StatusPill value={company.account_status || company.status || "active"} /><StatusPill value={company.verification_status || "pending"} />{company.plan_name || company.plan_code ? <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800">{titleCase(company.plan_name || company.plan_code)} {i18nText("ui.literals.kbed97175b06e")}</span> : null}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label={i18nText("ui.literals.kefb6604ad91f")} value={company.fleet_count} detail={i18nText("ui.literals.kbb4bc98dc970", { value0: numberValue(company.active_fleet_count) })} icon={Truck} tone="text-sky-700" /><Metric label={i18nText("ui.literals.k28b52fb26592")} value={company.rental_fleet_count} detail={i18nText("ui.literals.k58e7f6745a79")} icon={Gauge} /><Metric label={i18nText("ui.literals.ke90414358dbf")} value={company.operator_count} detail={i18nText("ui.literals.kfa5a3e13cecd")} icon={UsersRound} /><Metric label={i18nText("ui.literals.ked6b52430295")} value={company.admin_count} detail={i18nText("ui.literals.k28a29a612883")} icon={ShieldCheck} /><Metric label={i18nText("ui.literals.kfe5c54bbae46")} value={company.reservation_count} detail={i18nText("ui.literals.kec09452ceacb")} icon={Activity} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><UsageBar label={i18nText("ui.literals.k60261ed2752b")} used={company.fleet_count} limit={company.vehicle_limit} /><UsageBar label={i18nText("ui.literals.ke90414358dbf")} used={company.operator_count} limit={company.operator_limit} /></div></Panel>)}{operators.map((operator) => <Panel key={operator.id} title={operator.full_name || operator.name || i18nText("ui.literals.ke0b6cbdf73a4")} detail={`${operator.operator_mode === "solo" ? "Solo operator" : "Company-linked operator"} · ${operator.display_code || operator.public_id || "No operator ID"} · ${operator.city || "Location unavailable"}`} icon={UserRound}><div className="flex flex-wrap items-center gap-2"><StatusPill value={operator.account_status || operator.status || "active"} /><StatusPill value={operator.verification_status || "pending"} />{asArray(operator.service_modes).map((mode) => <span key={mode} className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-800">{titleCase(String(mode).replaceAll("_", " "))}</span>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label={i18nText("ui.literals.k60261ed2752b")} value={operator.fleet_count} detail={i18nText("ui.literals.k1afbf0e4642d")} icon={Truck} /><Metric label={i18nText("ui.literals.k9dba7ad7c5bd")} value={operator.company_count} detail={i18nText("ui.literals.k0d117fb2c6a8")} icon={Building2} /><Metric label={i18nText("ui.literals.k182702282d36")} value={operator.completed_jobs} detail={i18nText("ui.literals.kc244e8e6db10")} icon={Activity} /></div></Panel>)}</div>;
}

function SubscriptionCard({ item, compact = false }) {
  useUiLocale();
  const usageRows = [
    ["Products", "product_count", "product_limit"],
    ["Business admins", "admin_count", "admin_limit"],
    ["Vehicles", "fleet_count", "vehicle_limit"],
    ["Operators", "operator_count", "operator_limit"],
  ].filter(([, , limitKey]) => item.limits && Object.prototype.hasOwnProperty.call(item.limits, limitKey));
  return <article className="rounded-xl border border-zinc-200 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-black text-zinc-950">{item.entity_name || titleCase(item.surface || i18nText("ui.literals.k4cf5bc59bee9"))}</p><p className="mt-1 text-xs font-bold text-violet-700">{titleCase(item.plan_name || item.plan_code || i18nText("ui.literals.ke71f35adbc66"))}</p></div><StatusPill value={item.status || "active"} /></div><div className={`mt-3 grid gap-2 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}><Detail label={i18nText("ui.literals.k165755b9ab52")} value={formatDateTime(item.current_period_end)} /><Detail label={i18nText("ui.literals.kc9a1bccd9266")} value={item.auto_renew ? "Enabled" : "Off"} /><Detail label={i18nText("ui.literals.kcda05ca6d84a")} value={titleCase(item.surface || "platform")} /></div>{usageRows.length ? <div className="mt-4 space-y-2">{usageRows.map(([label, usageKey, limitKey]) => <UsageBar key={limitKey} label={translateUi(label)} used={usageKey === "product_count" ? item.usage?.plan_listing_count ?? item.usage?.product_count : item.usage?.[usageKey]} limit={item.limits[limitKey]} />)}</div> : null}</article>;
}

export function SubscriptionsPanel({ workspace }) {
  useUiLocale();
  const subscriptions = asArray(workspace.subscriptions);
  if (!subscriptions.length) return <EmptyState icon={CircleDollarSign} title={i18nText("ui.literals.k91a3352426b4")} body="UrMall and UrRide plans appear here when this user owns or manages a subscribed business or company." />;
  return <div className="grid gap-4 lg:grid-cols-2">{subscriptions.map((item) => <SubscriptionCard key={item.id} item={item} />)}</div>;
}

export function ActivityPanel({ workspace }) {
  useUiLocale();
  const activity = asArray(workspace.activity || workspace.audit);
  if (!activity.length) return <EmptyState icon={Activity} title={i18nText("ui.literals.k308d0ac8386b")} body="No scoped activity records are currently available for this user." />;
  return <div className="space-y-3">{activity.map((item, index) => <article key={item.id || `${item.action_key}-${index}`} className="flex gap-3 rounded-xl border border-zinc-200 p-3"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500"><Activity size={15} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black text-zinc-950">{item.title || titleCase(String(item.action_key || item.activity_type || i18nText("ui.literals.k0bf4170444cd")).replaceAll(".", " ").replaceAll("_", " "))}</p><span className="text-[11px] font-semibold text-zinc-400">{formatRelativeTime(item.created_at)}</span></div><p className="mt-1 text-xs font-medium leading-5 text-zinc-600">{item.reason || item.body || item.description || i18nText("ui.literals.k5d1293409dd4")}</p><p className="mt-2 text-[10px] font-black uppercase tracking-wide text-zinc-400">{titleCase(item.sector || item.surface || i18nText("ui.literals.k3c72abbe626f"))}</p></div></article>)}</div>;
}

function EmptyState({ icon: Icon, title, body }) {
  useUiLocale();
  return <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center"><Icon className="mx-auto text-zinc-300" size={30} /><p className="mt-3 text-sm font-black text-zinc-900">{translateUi(title)}</p><p className="mx-auto mt-1 max-w-md text-xs font-medium leading-5 text-zinc-500">{body}</p></div>;
}
