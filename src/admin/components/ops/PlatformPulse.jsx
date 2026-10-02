import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Building2, CarTaxiFront, ShieldAlert, ShoppingBag, Users } from "lucide-react";
import { getPlatformOverview } from "../../operationsService";
import { inlineErrorMessage } from "../../../Backend/services/friendlyErrorService";
import { formatDateTimeShort, titleize } from "./opsUtils";

// Live platform numbers for the command centre. Every figure comes from
// admin_platform_overview(); every tile opens the matching filtered screen.
function Tile({ label, value, detail, tone = "zinc", onClick, disabled }) {
  const tones = {
    zinc: "text-zinc-950",
    red: "text-red-700",
    orange: "text-orange-700",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
  };
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="group flex min-h-20 flex-col justify-between rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-default disabled:hover:bg-white">
      <span className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-wide text-zinc-500">{label}</span>
        {disabled ? null : <ArrowUpRight size={14} className="text-zinc-300 group-hover:text-zinc-600" />}
      </span>
      <span className={`mt-1 text-2xl font-black ${tones[tone]}`}>{Number(value || 0).toLocaleString()}</span>
      {detail ? <span className="text-[11px] font-semibold text-zinc-400">{detail}</span> : null}
    </button>
  );
}

function Group({ icon: Icon, title, children }) {
  return (
    <section>
      <p className="mb-2 flex items-center gap-2 text-xs font-black text-zinc-700"><Icon size={15} className="text-emerald-700" /> {title}</p>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

export default function PlatformPulse({ canOpen, onOpen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try { setData(await getPlatformOverview()); } catch (nextError) { setError(inlineErrorMessage(nextError, "Platform metrics are unavailable.")); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) {
    return <p className="mb-5 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-xs font-semibold text-zinc-500">{error}</p>;
  }
  if (!data) {
    return <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((key) => <div key={key} className="h-44 animate-pulse rounded-lg bg-zinc-100" />)}</div>;
  }

  const open = (page, query = "") => () => onOpen(page, query);
  const { users = {}, businesses = {}, operators = {}, companies = {}, governance = {}, recentActions = [] } = data;

  return (
    <div className="mb-6 space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Group icon={Users} title="Users">
          <Tile label="Total" value={users.total} detail={`+${users.new7d || 0} this week`} disabled={!canOpen("users")} onClick={open("users")} />
          <Tile label="Active 7d" value={users.active7d} tone="emerald" disabled={!canOpen("users")} onClick={open("users")} />
          <Tile label="Restricted" value={users.restricted} tone="orange" disabled={!canOpen("users")} onClick={open("users")} />
          <Tile label="Suspended" value={users.suspended} tone="red" disabled={!canOpen("users")} onClick={open("users")} />
        </Group>
        <Group icon={ShoppingBag} title="UrMall businesses">
          <Tile label="Total" value={businesses.total} detail={`+${businesses.new7d || 0} this week`} disabled={!canOpen("urmall-businesses")} onClick={open("urmall-businesses")} />
          <Tile label="Pending verification" value={businesses.pendingVerification} tone="amber" disabled={!canOpen("urmall-businesses")} onClick={open("urmall-businesses", "?verification=pending,submitted,under_review")} />
          <Tile label="Restricted" value={businesses.restricted} tone="orange" disabled={!canOpen("urmall-businesses")} onClick={open("urmall-businesses", "?status=restricted")} />
          <Tile label="Suspended" value={businesses.suspended} tone="red" disabled={!canOpen("urmall-businesses")} onClick={open("urmall-businesses", "?status=suspended,temporarily_suspended")} />
        </Group>
        <Group icon={CarTaxiFront} title="UrRide operators">
          <Tile label="Total" value={operators.total} detail={`${operators.approved || 0} approved`} disabled={!canOpen("urride-operators")} onClick={open("urride-operators")} />
          <Tile label="Pending review" value={operators.pendingReview} tone="amber" disabled={!canOpen("urride-operators")} onClick={open("urride-operators", "?account=submitted")} />
          <Tile label="Restricted" value={operators.restricted} tone="orange" disabled={!canOpen("urride-operators")} onClick={open("urride-operators", "?status=restricted")} />
          <Tile label="Suspended" value={operators.suspended} tone="red" disabled={!canOpen("urride-operators")} onClick={open("urride-operators", "?status=suspended,temporarily_suspended")} />
        </Group>
        <Group icon={Building2} title="UrRide companies">
          <Tile label="Total" value={companies.total} detail={`${companies.approved || 0} approved`} disabled={!canOpen("urride-companies")} onClick={open("urride-companies")} />
          <Tile label="Pending review" value={companies.pendingReview} tone="amber" disabled={!canOpen("urride-companies")} onClick={open("urride-companies", "?account=submitted")} />
          <Tile label="Restricted" value={companies.restricted} tone="orange" disabled={!canOpen("urride-companies")} onClick={open("urride-companies", "?status=restricted")} />
          <Tile label="Suspended" value={companies.suspended} tone="red" disabled={!canOpen("urride-companies")} onClick={open("urride-companies", "?status=suspended,temporarily_suspended")} />
        </Group>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-black text-zinc-700"><ShieldAlert size={15} className="text-emerald-700" /> Governance</p>
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Enforcement (7d)" value={governance.enforcementActions7d} disabled={!canOpen("audit")} onClick={open("audit")} />
            <Tile label="Direct notices (7d)" value={governance.directNotices7d} disabled={!canOpen("audit")} onClick={open("audit")} />
            <Tile label="Admin actions (24h)" value={governance.adminActions24h} disabled={!canOpen("audit")} onClick={open("audit")} />
            <Tile label="Active staff" value={governance.activeStaff} tone="emerald" disabled={!canOpen("team")} onClick={open("team")} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-black text-zinc-700">Latest admin actions</p>
          {recentActions.length ? (
            <ol className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
              {recentActions.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-sm font-black text-zinc-900">{titleize(String(entry.actionKey).replaceAll(".", " "))}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-500">{entry.label || entry.reason}</span>
                  <span className="whitespace-nowrap text-[11px] font-semibold text-zinc-400">{entry.actor} · {formatDateTimeShort(entry.createdAt)}</span>
                </li>
              ))}
            </ol>
          ) : <p className="rounded-lg border border-zinc-200 bg-white px-3 py-4 text-xs font-semibold text-zinc-500">No admin actions recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}
