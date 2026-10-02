import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw, ScrollText, Search, X } from "lucide-react";
import { searchAuditLog } from "../operationsService";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";
import { EmptyState, ErrorState, LoadingRows, Pagination, StatusBadge, inputClass } from "../components/ops/OpsPrimitives";
import { formatDateTimeShort, titleize, useDebouncedValue } from "../components/ops/opsUtils";

const PAGE_SIZE = 50;

const MODULES = [
  { key: "", label: "All modules" },
  { key: "platform", label: "Platform" },
  { key: "explore", label: "Explore" },
  { key: "marketplace", label: "UrMall" },
  { key: "transport", label: "UrRide" },
];

const ACTION_FAMILIES = [
  { key: "", label: "All actions" },
  { key: "enforcement.", label: "Enforcement" },
  { key: "notification.", label: "Direct notices" },
  { key: "team.", label: "Staff and access" },
  { key: "user.", label: "User accounts" },
  { key: "case.", label: "Cases" },
  { key: "campaign.", label: "Campaigns" },
  { key: "settings.", label: "Settings" },
];

const TARGETS = [
  { key: "", label: "Any target" },
  { key: "marketplace_business", label: "UrMall business" },
  { key: "transport_operator", label: "UrRide operator" },
  { key: "transport_company", label: "UrRide company" },
  { key: "user", label: "User" },
  { key: "admin_staff", label: "Staff member" },
  { key: "admin_assignment", label: "Admin role" },
];

function actionTone(key = "") {
  if (/suspension|revoked|banned|deactivat/.test(key)) return "red";
  if (/restriction|status_changed|warning/.test(key)) return "orange";
  if (/restoration|granted|expired/.test(key)) return "emerald";
  return "zinc";
}

function JsonBlock({ label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-zinc-400">{label}</p>
      <pre className="max-h-56 overflow-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-4 text-zinc-100">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default function AuditLogView() {
  const [filters, setFilters] = useState({ search: "", action: "", sector: "", resource: "", from: "", to: "" });
  const [searchText, setSearchText] = useState("");
  const debounced = useDebouncedValue(searchText);
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState("");
  const requestRef = useRef(0);

  useEffect(() => { setFilters((current) => (current.search === debounced ? current : { ...current, search: debounced })); }, [debounced]);
  useEffect(() => { setPage(0); }, [filters]);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true); setError("");
    try {
      const result = await searchAuditLog(filters, { page, pageSize: PAGE_SIZE });
      if (requestId === requestRef.current) setData(result);
    } catch (nextError) {
      if (requestId === requestRef.current) setError(inlineErrorMessage(nextError, "Audit history could not be loaded."));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);

  const update = (patch) => setFilters((current) => ({ ...current, ...patch }));
  const filtered = filters.action || filters.sector || filters.resource || filters.from || filters.to || filters.search;

  return (
    <>
      <header className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><ScrollText size={21} /></span>
          <div>
            <p className="text-xs font-black uppercase text-emerald-700">Governance</p>
            <h1 className="mt-0.5 text-2xl font-black text-zinc-950 sm:text-3xl">Audit log</h1>
            <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-zinc-600">Every sensitive admin action, who did it, when and why. Entries are permanent: nobody, including Super Admins, can edit or delete them.</p>
          </div>
        </div>
        <button type="button" onClick={load} className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-zinc-300 bg-white px-3 text-sm font-black text-zinc-700 hover:bg-zinc-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="grid gap-2 border-b border-zinc-100 p-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="relative sm:col-span-2"><span className="sr-only">Search</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Action, reason, name, admin email or record ID" className={`${inputClass} pl-9`} /></label>
          <select aria-label="Action" value={filters.action} onChange={(event) => update({ action: event.target.value })} className={inputClass}>{ACTION_FAMILIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
          <select aria-label="Module" value={filters.sector} onChange={(event) => update({ sector: event.target.value })} className={inputClass}>{MODULES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
          <select aria-label="Target" value={filters.resource} onChange={(event) => update({ resource: event.target.value })} className={inputClass}>{TARGETS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
          <div className="flex gap-2">
            <input aria-label="From" type="date" value={filters.from} onChange={(event) => update({ from: event.target.value })} className={inputClass} />
            <input aria-label="To" type="date" value={filters.to} onChange={(event) => update({ to: event.target.value })} className={inputClass} />
          </div>
        </div>
        {filtered ? (
          <div className="flex justify-end border-b border-zinc-100 px-3 py-2">
            <button type="button" onClick={() => { setSearchText(""); setFilters({ search: "", action: "", sector: "", resource: "", from: "", to: "" }); }} className="inline-flex items-center gap-1 text-xs font-black text-zinc-600 hover:text-zinc-950"><X size={13} /> Clear filters</button>
          </div>
        ) : null}

        {error ? <ErrorState message={error} onRetry={load} />
          : loading && !data.rows.length ? <LoadingRows />
            : !data.rows.length ? <EmptyState title={filtered ? "No matching entries" : "No admin actions yet"} />
              : (
                <ul className={`divide-y divide-zinc-100 ${loading ? "opacity-60" : ""}`}>
                  {data.rows.map((entry) => {
                    const open = expanded === entry.id;
                    return (
                      <li key={entry.id}>
                        <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? "" : entry.id)} className="grid w-full gap-2 px-4 py-3 text-left hover:bg-zinc-50 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-center">
                          <span className="min-w-0">
                            <StatusBadge tone={actionTone(entry.action_key)}>{titleize(String(entry.action_key).replaceAll(".", " "))}</StatusBadge>
                            <span className="mt-1 block truncate text-[11px] font-semibold text-zinc-500">{entry.sector === "marketplace" ? "UrMall" : entry.sector === "transport" ? "UrRide" : titleize(entry.sector || "platform")}{entry.resource_type ? ` · ${titleize(entry.resource_type)}` : ""}{entry.metadata?.label ? ` · ${entry.metadata.label}` : ""}</span>
                          </span>
                          <span className="min-w-0"><span className="block truncate text-sm font-black text-zinc-900">{entry.actor_name}</span><span className="block truncate text-[11px] font-semibold text-zinc-400">{(entry.actor_role_keys || []).map(titleize).join(", ") || entry.actor_email || "System"}</span></span>
                          <span className="line-clamp-2 text-xs font-medium text-zinc-600">{entry.reason || "—"}</span>
                          <span className="flex items-center gap-2 whitespace-nowrap text-[11px] font-semibold text-zinc-400">{formatDateTimeShort(entry.created_at)}<ChevronDown size={14} className={open ? "rotate-180 transition" : "transition"} /></span>
                        </button>
                        {open ? (
                          <div className="grid gap-3 bg-zinc-50 px-4 py-3 lg:grid-cols-3">
                            <JsonBlock label="Before" value={entry.before_state} />
                            <JsonBlock label="After" value={entry.after_state} />
                            <JsonBlock label="Details" value={{ ...entry.metadata, resourceId: entry.resource_id }} />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} busy={loading} />
      </section>
    </>
  );
}
