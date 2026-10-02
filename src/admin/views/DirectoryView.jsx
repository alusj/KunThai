import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, CarTaxiFront, MoreHorizontal, RefreshCw, Search, ShoppingBag, SlidersHorizontal, X } from "lucide-react";
import {
  ACCOUNT_STATUS_FILTER_OPTIONS,
  BUSINESS_KINDS,
  ENFORCEMENT_FILTER_OPTIONS,
  ENFORCEMENT_STATUS,
  SORT_OPTIONS,
  TARGET_TYPES,
  VERIFICATION_FILTER_OPTIONS,
  availableEnforcementActions,
  buildHashQuery,
  businessKindLabel,
  canNotifyOwner,
  parseHashQuery,
  toArrayFilter,
} from "../operationsConfig";
import { listDirectory } from "../operationsService";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";
import DirectoryDrawer from "../components/ops/DirectoryDrawer";
import { ChipMultiSelect, EmptyState, ErrorState, LoadingRows, Pagination, StatusBadge, inputClass } from "../components/ops/OpsPrimitives";
import { formatDate, titleize, useDebouncedValue } from "../components/ops/opsUtils";

const PAGE_SIZE = 25;
const PLURAL = { business: "businesses", operator: "operators", company: "companies" };

const FLEET_TYPES = ["car", "motorbike", "keke", "bus", "van", "truck", "bicycle"].map((key) => ({ key, label: titleize(key) }));
const SERVICES = ["transport", "delivery", "both"].map((key) => ({ key, label: titleize(key) }));

const VIEW_META = {
  marketplace_business: {
    icon: ShoppingBag,
    description: "Every UrMall business with its owner, type, verification and enforcement state. Search, filter and act on a business without leaving this page.",
    searchPlaceholder: "Business name, business ID, owner name, email or KunThai ID",
  },
  transport_operator: {
    icon: CarTaxiFront,
    description: "Solo and company-affiliated UrRide operators with their vehicles, services and trip activity.",
    searchPlaceholder: "Operator name, code, phone, email or KunThai ID",
  },
  transport_company: {
    icon: Building2,
    description: "UrRide transport and delivery companies with their operators, vehicles and services.",
    searchPlaceholder: "Company name, company ID, owner, email or phone",
  },
};

function readFilters() {
  const query = parseHashQuery(window.location.hash);
  return {
    search: typeof query.search === "string" ? query.search : "",
    status: toArrayFilter(query.status),
    verification: toArrayFilter(query.verification),
    kind: toArrayFilter(query.kind),
    account: toArrayFilter(query.account),
    country: typeof query.country === "string" ? query.country : "",
    city: typeof query.city === "string" ? query.city : "",
    from: typeof query.from === "string" ? query.from : "",
    to: typeof query.to === "string" ? query.to : "",
    fleetType: typeof query.fleetType === "string" ? query.fleetType : "",
    service: typeof query.service === "string" ? query.service : "",
    sort: typeof query.sort === "string" ? query.sort : "newest",
  };
}

const EMPTY_FILTERS = { search: "", status: [], verification: [], kind: [], account: [], country: "", city: "", from: "", to: "", fleetType: "", service: "", sort: "newest" };

function rowCells(targetType, row) {
  if (targetType === "marketplace_business") {
    return {
      title: row.business_name,
      subtitle: row.public_business_id || businessKindLabel(row.business_kind),
      owner: row.owner_name,
      ownerSub: row.owner_public_id,
      type: businessKindLabel(row.business_kind),
      location: [row.city, row.country].filter(Boolean).join(", "),
      metrics: `${Number(row.listing_count || 0).toLocaleString()} listings · ${Number(row.order_count || 0).toLocaleString()} orders`,
      created: row.created_at,
      activity: row.last_activity_at,
    };
  }
  if (targetType === "transport_operator") {
    return {
      title: row.full_name,
      subtitle: row.operator_code || row.phone,
      owner: row.companies?.length ? row.companies.join(", ") : "Solo operator",
      ownerSub: row.public_id,
      type: [row.fleet_types?.map(titleize).join(", "), row.services?.map(titleize).join(", ")].filter(Boolean).join(" · ") || "No vehicle",
      location: [row.city, row.country].filter(Boolean).join(", "),
      metrics: `${Number(row.fleet_count || 0)} vehicles · ${Number(row.trip_count || 0).toLocaleString()} trips`,
      created: row.created_at,
      activity: row.last_trip_at,
    };
  }
  return {
    title: row.company_name,
    subtitle: row.company_code || row.company_type,
    owner: row.owner_name,
    ownerSub: row.owner_public_id,
    type: row.services?.map(titleize).join(", ") || row.company_type || "—",
    location: [row.city, row.country].filter(Boolean).join(", "),
    metrics: `${Number(row.operator_count || 0)} operators · ${Number(row.fleet_count || 0)} vehicles · ${Number(row.trip_count || 0).toLocaleString()} trips`,
    created: row.created_at,
    activity: row.last_activity_at,
  };
}

function rowLabel(targetType, row) {
  return targetType === "marketplace_business" ? row.business_name : targetType === "transport_operator" ? row.full_name : row.company_name;
}

function RowMenu({ access, targetType, row, onOpen }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const actions = availableEnforcementActions(access, targetType, row.enforcement_status);
  const notify = canNotifyOwner(access, targetType);
  useEffect(() => {
    if (!open) return undefined;
    function close(event) { if (!ref.current?.contains(event.target)) setOpen(false); }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative" onClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label="Actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"><MoreHorizontal size={17} /></button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-zinc-200 bg-white p-1.5 text-left shadow-xl">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpen(null); }} className="block w-full rounded-md px-3 py-2 text-left text-sm font-bold text-zinc-800 hover:bg-zinc-50">View details</button>
          {notify ? <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpen({ kind: "notify" }); }} className="block w-full rounded-md px-3 py-2 text-left text-sm font-bold text-zinc-800 hover:bg-zinc-50">Send notification</button> : null}
          {actions.length ? <div className="my-1 border-t border-zinc-100" /> : null}
          {actions.map((action) => (
            <button key={action.key} type="button" role="menuitem" onClick={() => { setOpen(false); onOpen({ kind: "enforce", action: action.key }); }} className={`block w-full rounded-md px-3 py-2 text-left text-sm font-bold hover:bg-zinc-50 ${action.tone === "emerald" ? "text-emerald-700" : action.tone === "amber" ? "text-amber-800" : action.tone === "orange" ? "text-orange-700" : "text-red-700"}`}>
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function DirectoryView({ targetType, access, pageId }) {
  const meta = VIEW_META[targetType];
  const target = TARGET_TYPES[targetType];
  const Icon = meta.icon;
  const [filters, setFilters] = useState(readFilters);
  const [searchText, setSearchText] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchText);
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(() => Boolean(filters.country || filters.city || filters.from || filters.to || filters.fleetType || filters.service));
  const [selected, setSelected] = useState(null); // { id, label, dialog }
  const requestRef = useRef(0);

  useEffect(() => {
    setFilters((current) => (current.search === debouncedSearch ? current : { ...current, search: debouncedSearch }));
  }, [debouncedSearch]);

  // Keep the filters in the URL so a view can be shared or linked to.
  useEffect(() => {
    const next = `#/${pageId}${buildHashQuery({ ...filters, sort: filters.sort === "newest" ? "" : filters.sort })}`;
    if (window.location.hash !== next) window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}${next}`);
  }, [filters, pageId]);

  useEffect(() => { setPage(0); }, [filters]);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const result = await listDirectory(targetType, filters, { page, pageSize: PAGE_SIZE });
      if (requestId === requestRef.current) setData(result);
    } catch (nextError) {
      if (requestId === requestRef.current) setError(inlineErrorMessage(nextError, "This directory could not be loaded."));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [filters, page, targetType]);

  useEffect(() => { load(); }, [load]);

  const update = (patch) => setFilters((current) => ({ ...current, ...patch }));
  const activeFilterCount = useMemo(
    () => ["status", "verification", "kind", "account"].reduce((sum, key) => sum + (filters[key].length ? 1 : 0), 0)
      + ["country", "city", "from", "to", "fleetType", "service"].reduce((sum, key) => sum + (filters[key] ? 1 : 0), 0),
    [filters],
  );

  function clearAll() {
    setSearchText("");
    setFilters({ ...EMPTY_FILTERS, sort: filters.sort });
  }

  return (
    <>
      <header className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon size={21} /></span>
          <div>
            <p className="text-xs font-black uppercase text-emerald-700">Directory</p>
            <h1 className="mt-0.5 text-2xl font-black text-zinc-950 sm:text-3xl">{target.title}</h1>
            <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-zinc-600">{meta.description}</p>
          </div>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-zinc-300 bg-white px-3 text-sm font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 sm:self-auto">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-100 p-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={meta.searchPlaceholder} className={`${inputClass} pl-9`} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <ChipMultiSelect label="Status" options={ENFORCEMENT_FILTER_OPTIONS} value={filters.status} onChange={(value) => update({ status: value })} />
            {targetType === "marketplace_business" ? <ChipMultiSelect label="Type" options={BUSINESS_KINDS} value={filters.kind} onChange={(value) => update({ kind: value })} /> : null}
            <ChipMultiSelect label="Verification" options={VERIFICATION_FILTER_OPTIONS} value={filters.verification} onChange={(value) => update({ verification: value })} />
            {targetType !== "marketplace_business" ? <ChipMultiSelect label="Registration" options={ACCOUNT_STATUS_FILTER_OPTIONS} value={filters.account} onChange={(value) => update({ account: value })} /> : null}
            <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((current) => !current)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-700 hover:bg-zinc-50"><SlidersHorizontal size={14} /> More</button>
            <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white pl-3 text-xs font-black text-zinc-500">
              Sort
              <select value={filters.sort} onChange={(event) => update({ sort: event.target.value })} className="h-full rounded-r-lg bg-transparent pr-2 text-xs font-black text-zinc-800 outline-none">
                {SORT_OPTIONS[targetType].map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {moreOpen ? (
          <div className="grid gap-3 border-b border-zinc-100 bg-zinc-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-black text-zinc-500">Country<input value={filters.country} onChange={(event) => update({ country: event.target.value })} placeholder="e.g. Nigeria or NG" className={`${inputClass} mt-1`} /></label>
            <label className="text-xs font-black text-zinc-500">City<input value={filters.city} onChange={(event) => update({ city: event.target.value })} placeholder="Any city" className={`${inputClass} mt-1`} /></label>
            <label className="text-xs font-black text-zinc-500">Registered from<input type="date" value={filters.from} onChange={(event) => update({ from: event.target.value })} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs font-black text-zinc-500">Registered to<input type="date" value={filters.to} onChange={(event) => update({ to: event.target.value })} className={`${inputClass} mt-1`} /></label>
            {targetType !== "marketplace_business" ? (
              <label className="text-xs font-black text-zinc-500">Service
                <select value={filters.service} onChange={(event) => update({ service: event.target.value })} className={`${inputClass} mt-1`}>
                  <option value="">Any service</option>
                  {SERVICES.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </label>
            ) : null}
            {targetType === "transport_operator" ? (
              <label className="text-xs font-black text-zinc-500">Vehicle type
                <select value={filters.fleetType} onChange={(event) => update({ fleetType: event.target.value })} className={`${inputClass} mt-1`}>
                  <option value="">Any vehicle</option>
                  {FLEET_TYPES.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        {activeFilterCount || filters.search ? (
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 text-xs font-bold text-zinc-500">
            <span>{activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}{filters.search ? ` · “${filters.search}”` : ""}</span>
            <button type="button" onClick={clearAll} className="inline-flex items-center gap-1 font-black text-zinc-700 hover:text-zinc-950"><X size={13} /> Clear all</button>
          </div>
        ) : null}

        {error ? <ErrorState message={error} onRetry={load} />
          : loading && !data.rows.length ? <LoadingRows />
            : !data.rows.length ? (
              <EmptyState
                title={activeFilterCount || filters.search ? "No matches" : `No ${PLURAL[target.noun]} yet`}
                detail={activeFilterCount || filters.search ? "Try a different search or clear the filters." : ""}
                action={activeFilterCount || filters.search ? <button type="button" onClick={clearAll} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-black text-zinc-700">Clear filters</button> : null}
              />
            ) : (
              <div className={loading ? "opacity-60 transition-opacity" : ""}>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-[11px] font-black uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-4 py-2.5">{titleize(target.noun)}</th>
                        <th className="px-3 py-2.5">{targetType === "transport_operator" ? "Affiliation" : "Owner"}</th>
                        <th className="px-3 py-2.5">{targetType === "marketplace_business" ? "Type" : "Vehicles / services"}</th>
                        <th className="px-3 py-2.5">Location</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5">Registered</th>
                        <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {data.rows.map((row) => {
                        const cells = rowCells(targetType, row);
                        const status = ENFORCEMENT_STATUS[row.enforcement_status] || ENFORCEMENT_STATUS.active;
                        return (
                          <tr key={row.id} tabIndex={0} onClick={() => setSelected({ id: row.id, label: rowLabel(targetType, row) })} onKeyDown={(event) => { if (event.key === "Enter") setSelected({ id: row.id, label: rowLabel(targetType, row) }); }} className="cursor-pointer hover:bg-zinc-50 focus:bg-emerald-50/40 focus:outline-none">
                            <td className="max-w-[18rem] px-4 py-3">
                              <p className="truncate font-black text-zinc-950">{cells.title}</p>
                              <p className="truncate text-[11px] font-semibold text-zinc-500">{cells.subtitle} · {cells.metrics}</p>
                            </td>
                            <td className="max-w-[12rem] px-3 py-3">
                              <p className="truncate font-semibold text-zinc-800">{cells.owner}</p>
                              <p className="truncate text-[11px] font-semibold text-zinc-400">{cells.ownerSub}</p>
                            </td>
                            <td className="max-w-[12rem] truncate px-3 py-3 font-semibold text-zinc-700">{cells.type}</td>
                            <td className="max-w-[10rem] truncate px-3 py-3 font-semibold text-zinc-700">{cells.location || "—"}</td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col items-start gap-1">
                                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                                <span className="text-[10px] font-bold text-zinc-400">{titleize(row.verification_status)}</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-zinc-500">{formatDate(cells.created)}</td>
                            <td className="px-3 py-3 text-right"><RowMenu access={access} targetType={targetType} row={row} onOpen={(dialog) => setSelected({ id: row.id, label: rowLabel(targetType, row), dialog })} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <ul className="divide-y divide-zinc-100 md:hidden">
                  {data.rows.map((row) => {
                    const cells = rowCells(targetType, row);
                    const status = ENFORCEMENT_STATUS[row.enforcement_status] || ENFORCEMENT_STATUS.active;
                    return (
                      <li key={row.id}>
                        <div role="button" tabIndex={0} onClick={() => setSelected({ id: row.id, label: rowLabel(targetType, row) })} onKeyDown={(event) => { if (event.key === "Enter") setSelected({ id: row.id, label: rowLabel(targetType, row) }); }} className="flex items-start gap-3 px-4 py-3 active:bg-zinc-50">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-black text-zinc-950">{cells.title}</p>
                              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                            </div>
                            <p className="mt-0.5 truncate text-xs font-semibold text-zinc-600">{cells.owner} · {cells.type}</p>
                            <p className="mt-0.5 truncate text-[11px] font-semibold text-zinc-400">{cells.location || "No location"} · {cells.metrics}</p>
                          </div>
                          <RowMenu access={access} targetType={targetType} row={row} onOpen={(dialog) => setSelected({ id: row.id, label: rowLabel(targetType, row), dialog })} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

        <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} busy={loading} />
      </section>

      {selected ? (
        <DirectoryDrawer
          key={`${selected.id}-${selected.dialog?.action || selected.dialog?.kind || "view"}`}
          targetType={targetType}
          id={selected.id}
          access={access}
          initialLabel={selected.label}
          initialDialog={selected.dialog || null}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      ) : null}
    </>
  );
}
