import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, History, LoaderCircle, RefreshCcw, RotateCcw, ScrollText, Search } from "lucide-react";

import { formatDateTime, formatRelativeTime, titleCase } from "../adminConfig";
import {
  ADMIN_ACTIVITY_REFRESH_EVENT,
  getAdminActivityNotifications,
  undoAdminActivityAction,
} from "../adminService";

const STATUS_META = {
  active: { label: "Completed", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  undo_requested: { label: "Undo requested", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  undone: { label: "Undone", className: "bg-sky-50 text-sky-800 ring-sky-200" },
  dismissed: { label: "Dismissed", className: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
};

const FILTERS = [
  { key: "all", label: "All actions" },
  { key: "mine", label: "My actions" },
  { key: "reversible", label: "Can be undone" },
  { key: "undone", label: "Undone" },
];

function getStatus(item = {}) {
  return item.metadata?.undoStatus || item.action_status || "active";
}

function isSelfAction(item, userId) {
  return Boolean(item.metadata?.selfAction || (item.actor_user_id && userId && item.actor_user_id === userId));
}

function canUndo(item, userId) {
  return isSelfAction(item, userId) && getStatus(item) === "active" && Boolean(item.audit_log_id || item.id);
}

function ActionRow({ item, userId, busy, onUndo }) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const status = getStatus(item);
  const meta = STATUS_META[status] || STATUS_META.active;
  const undoable = canUndo(item, userId);

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-zinc-950">{item.title || titleCase(item.action_key || "Admin action")}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ring-1 ${meta.className}`}>{meta.label}</span>
            {item.sector ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-600">{titleCase(item.sector)}</span>
            ) : null}
          </div>
          {item.body ? <p className="mt-1 text-sm font-medium leading-6 text-zinc-600">{item.body}</p> : null}
          <p className="mt-2 text-xs font-semibold text-zinc-400">
            {item.metadata?.actorName || (isSelfAction(item, userId) ? "You" : "Another admin")}
            {" · "}
            <span title={formatDateTime(item.created_at)}>{formatRelativeTime(item.created_at)}</span>
            {item.audit_log_id ? ` · Audit ${String(item.audit_log_id).slice(0, 8)}` : ""}
          </p>
          {item.metadata?.undoReason ? (
            <p className="mt-2 rounded-md bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">
              Undo reason: {item.metadata.undoReason}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {item.audit_log_id ? (
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(String(item.audit_log_id))}
              title="Copy full audit ID"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-black text-zinc-600 hover:bg-zinc-50"
            >
              <ScrollText size={14} /> Audit ID
            </button>
          ) : null}
          {undoable ? (
            <button
              type="button"
              onClick={() => setReasonOpen((open) => !open)}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-950 px-3 text-xs font-black text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              <RotateCcw size={14} /> Undo
            </button>
          ) : null}
        </div>
      </div>

      {reasonOpen && undoable ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-amber-800">Undo this action</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-amber-900">
            The reversal is written to the audit log with your name and reason. Only the admin who performed an action can undo it; Chief and Super Admins review every undo.
          </p>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="Why is this action being reversed?"
            className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 outline-none focus:border-amber-500"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReasonOpen(false)}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-black text-zinc-700 hover:bg-zinc-50"
            >
              Keep action
            </button>
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={() => {
                onUndo(item, reason.trim());
                setReasonOpen(false);
                setReason("");
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-black text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />} Confirm undo
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function ActionHistoryView({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const userId = user?.id || "";

  async function load(quiet = false) {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      setItems(await getAdminActivityNotifications(100));
    } catch (nextError) {
      setError(nextError.message || "Unable to load admin action history.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const handleRefresh = () => load(true);
    window.addEventListener(ADMIN_ACTIVITY_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(ADMIN_ACTIVITY_REFRESH_EVENT, handleRefresh);
    // load is stable for this view's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUndo(item, reason) {
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      const result = await undoAdminActivityAction(item.id, reason);
      setNotice(result?.message || "Undo recorded. The action is reversed and logged for oversight review.");
      await load(true);
    } catch (nextError) {
      setError(nextError.message || "Unable to undo this action.");
    } finally {
      setBusyId("");
    }
  }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "mine" && !isSelfAction(item, userId)) return false;
      if (filter === "reversible" && !canUndo(item, userId)) return false;
      if (filter === "undone" && !["undone", "undo_requested"].includes(getStatus(item))) return false;
      if (!query) return true;
      return [item.title, item.body, item.action_key, item.sector, item.metadata?.actorName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [filter, items, search, userId]);

  const undoableCount = useMemo(() => items.filter((item) => canUndo(item, userId)).length, [items, userId]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Governance</p>
          <h1 className="mt-1 text-2xl font-black text-zinc-950">Action history</h1>
          <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-600">
            Every recent administrative action in one place. Actions you performed can be reversed here with a documented reason; the original and the undo both stay in the audit log.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-700 hover:bg-zinc-50"
        >
          <RefreshCcw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-lg bg-zinc-100 p-1">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`h-8 rounded-md px-3 text-xs font-black transition ${
                filter === option.key ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {option.label}
              {option.key === "reversible" && undoableCount ? ` (${undoableCount})` : ""}
            </button>
          ))}
        </div>
        <label className="relative sm:w-64">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search actions"
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-600"
          />
        </label>
      </div>

      {notice ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 size={16} /> {notice}
        </p>
      ) : null}
      {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <div className="mt-4 grid gap-3">
        {loading ? (
          <p className="flex items-center gap-2 py-10 text-sm font-bold text-zinc-500">
            <LoaderCircle size={16} className="animate-spin text-emerald-700" /> Loading admin actions…
          </p>
        ) : visible.length ? (
          visible.map((item) => (
            <ActionRow key={item.id} item={item} userId={userId} busy={busyId === item.id} onUndo={handleUndo} />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center">
            <History size={22} className="mx-auto text-zinc-400" />
            <p className="mt-3 text-sm font-black text-zinc-950">No actions in this view</p>
            <p className="mt-1 text-sm font-medium text-zinc-500">Administrative actions appear here as the team works.</p>
          </div>
        )}
      </div>
    </>
  );
}
