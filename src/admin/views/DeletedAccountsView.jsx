import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw, Search } from "lucide-react";

import { formatDateTime, formatRelativeTime } from "../adminConfig";
import { DELETION_SURFACE_LABELS, getDeletedAccounts } from "../deletedAccountsAdminService";
import { DELETION_REASON_KEYS, DELETION_REASON_LABELS } from "../../Backend/services/accountDeletionReasonService";
import { PageHeading } from "./AdminViews";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";

const TABS = [{ key: "all", label: "All" }, ...Object.entries(DELETION_SURFACE_LABELS).map(([key, label]) => ({ key, label }))];

function Metric({ label, value, detail }) {
  useUiLocale();
  return (
    <div className="min-h-24 rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-black uppercase text-zinc-500">{translateUi(label)}</p>
      <p className="mt-2 text-3xl font-black text-zinc-950">{value}</p>
      {detail ? <p className="mt-1 truncate text-xs font-semibold text-zinc-500">{translateUi(detail)}</p> : null}
    </div>
  );
}

function reasonLabel(key) {
  return DELETION_REASON_LABELS[key] || key;
}

export default function DeletedAccountsView() {
  useUiLocale();
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      setRows(await getDeletedAccounts());
    } catch (loadError) {
      setError(inlineErrorMessage(loadError, "Unable to load deleted accounts."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    const counts = new Map();
    rows.forEach((row) => (row.reasons || []).forEach((key) => counts.set(key, (counts.get(key) || 0) + 1)));
    const [topKey, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    return {
      lastMonth: rows.filter((row) => new Date(row.created_at).getTime() >= monthAgo).length,
      withReason: rows.filter((row) => (row.reasons || []).length || String(row.note || "").trim()).length,
      topReason: topKey ? reasonLabel(topKey) : "",
      topReasonCount: topCount || 0,
    };
  }, [rows]);

  const visible = useMemo(() => {
    const text = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab !== "all" && row.surface !== tab) return false;
      if (reasonFilter === "note" && !String(row.note || "").trim()) return false;
      if (reasonFilter === "none" && ((row.reasons || []).length || String(row.note || "").trim())) return false;
      if (!["all", "note", "none"].includes(reasonFilter) && !(row.reasons || []).includes(reasonFilter)) return false;
      if (!text) return true;
      return [row.account_name, row.username, row.email, row.target_name, row.note]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(text));
    });
  }, [reasonFilter, rows, search, tab]);

  return (
    <>
      <PageHeading
        eyebrow="Account care"
        title="Deleted accounts"
        description="Every deleted KunThai account, UrMall business, UrRide operator account, UrRide company and Space, with the reasons people gave."
        action={
          <button
            type="button"
            onClick={() => load(true)}
            className="flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-black text-zinc-700 hover:bg-zinc-50"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> {translateUi("Refresh")}
          </button>
        }
      />

      {error ? <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{translateUi(error)}</p> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Deleted" value={rows.length} />
        <Metric label="Last 30 days" value={summary.lastMonth} />
        <Metric label="Gave a reason" value={summary.withReason} />
        <Metric label="Top reason" value={summary.topReason ? summary.topReasonCount : "—"} detail={summary.topReason} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((item) => {
          const total = item.key === "all" ? rows.length : rows.filter((row) => row.surface === item.key).length;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`flex h-10 items-center gap-2 rounded-md px-3 text-sm font-black ${
                tab === item.key ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {translateUi(item.label)}
              <span className={tab === item.key ? "text-zinc-300" : "text-zinc-400"}>{total}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <span className="sr-only">{translateUi("Search deleted accounts")}</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={translateUi("Search name, email, business or note")}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-600"
          />
        </label>
        <select
          value={reasonFilter}
          onChange={(event) => setReasonFilter(event.target.value)}
          className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm font-black outline-none focus:border-emerald-600 sm:w-64"
        >
          <option value="all">{translateUi("Any reason")}</option>
          {DELETION_REASON_KEYS.map((key) => (
            <option key={key} value={key}>{translateUi(reasonLabel(key))}</option>
          ))}
          <option value="note">{translateUi("Wrote their own reason")}</option>
          <option value="none">{translateUi("No reason given")}</option>
        </select>
      </div>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {loading ? (
          <p className="flex items-center gap-2 p-5 text-sm font-bold text-zinc-500">
            <LoaderCircle className="animate-spin" size={16} /> {translateUi("Loading deleted accounts…")}
          </p>
        ) : !visible.length ? (
          <p className="p-8 text-center text-sm font-bold text-zinc-400">{translateUi("No deleted accounts match.")}</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {visible.map((row) => {
              const name = row.account_name || (row.username ? `@${row.username}` : "") || row.email || "Unnamed account";
              const note = String(row.note || "").trim();
              return (
                <li key={row.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate text-sm font-black text-zinc-950">{name}</p>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-600">
                      {translateUi(DELETION_SURFACE_LABELS[row.surface] || row.surface)}
                    </span>
                    <span className="ml-auto flex-none text-xs font-semibold text-zinc-400" title={formatDateTime(row.created_at)}>
                      {formatRelativeTime(row.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs font-semibold text-zinc-500">
                    {[row.target_name, row.username && row.account_name ? `@${row.username}` : "", row.email].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {(row.reasons || []).length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {row.reasons.map((key) => (
                        <span key={key} className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-black text-rose-800 ring-1 ring-rose-200">
                          {translateUi(reasonLabel(key))}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {note ? (
                    <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium leading-6 text-zinc-700">{note}</p>
                  ) : null}
                  {!(row.reasons || []).length && !note ? (
                    <p className="mt-2 text-xs font-semibold text-zinc-400">{translateUi("No reason given")}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
