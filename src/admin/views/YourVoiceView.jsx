import { useCallback, useEffect, useMemo, useState } from "react";
import { Bug, CircleHelp, Inbox, Lightbulb, LoaderCircle, MessageSquareWarning, RefreshCw, Search, ShieldAlert, X } from "lucide-react";

import { canAccess, formatDateTime, formatRelativeTime } from "../adminConfig";
import { getYourVoiceAttachments, getYourVoiceFeedback, updateYourVoiceFeedback } from "../yourVoiceAdminService";
import {
  YOUR_VOICE_CATEGORY_LABELS,
  YOUR_VOICE_STATUS_LABELS,
  YOUR_VOICE_STATUSES,
  YOUR_VOICE_TYPE_LABELS,
  countYourVoice,
  filterYourVoice,
} from "../yourVoiceRules.js";
import { PageHeading } from "./AdminViews";
import { t as i18nText } from "../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";

const TABS = [
  { key: "all", label: "Overview", icon: Inbox },
  { key: "idea", label: "Idea", icon: Lightbulb },
  { key: "bug", label: "Bug", icon: Bug },
  { key: "complaint", label: "Complaint", icon: MessageSquareWarning },
  { key: "safety", label: "Safety", icon: ShieldAlert },
  { key: "other", label: "Other", icon: CircleHelp },
];

const STATUS_TONES = {
  submitted: "bg-sky-50 text-sky-800 ring-sky-200",
  under_review: "bg-amber-50 text-amber-800 ring-amber-200",
  planned: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  fixed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  closed: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

function label(map, value) {
  return translateUi(map[value] || String(value || ""));
}

function personName(row) {
  return row.display_name || (row.username ? `@${row.username}` : i18nText("adminYourVoice.unknownUser"));
}

function Metric({ label: title, value, detail }) {
  return (
    <div className="min-h-24 rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-black uppercase text-zinc-500">{title}</p>
      <p className="mt-2 text-3xl font-black text-zinc-950">{value}</p>
      {detail ? <p className="mt-1 text-xs font-semibold text-zinc-500">{detail}</p> : null}
    </div>
  );
}

function Attachment({ entry }) {
  if (!entry?.url) return <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-500">{i18nText("adminYourVoice.attachmentUnavailable")}</p>;
  if (entry.kind === "audio") return <audio controls src={entry.url} className="w-full" />;
  return (
    <a href={entry.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-zinc-200">
      <img src={entry.url} alt={translateUi(entry.label)} className="max-h-96 w-full object-contain bg-zinc-50" />
    </a>
  );
}

function YourVoiceDrawer({ feedback, canManage, onClose, onUpdated }) {
  useUiLocale();
  const [status, setStatus] = useState(feedback.status);
  const [reply, setReply] = useState(feedback.admin_reply || "");
  const [attachments, setAttachments] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getYourVoiceAttachments(feedback).then((entries) => { if (active) setAttachments(entries); });
    return () => { active = false; };
  }, [feedback]);

  // Opening the feedback marks it seen, as the person's own screen expects:
  // once staff have seen it, they can no longer edit what they sent.
  useEffect(() => {
    if (!canManage || feedback.admin_seen) return;
    updateYourVoiceFeedback(feedback.id, { admin_seen: true })
      .then((updated) => onUpdated(updated))
      .catch(() => null);
  }, [canManage, feedback.admin_seen, feedback.id, onUpdated]);

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await updateYourVoiceFeedback(feedback.id, { status, admin_reply: reply, admin_seen: true });
      onUpdated(updated);
      setMessage(i18nText("adminYourVoice.saved"));
    } catch (saveError) {
      setError(inlineErrorMessage(saveError, i18nText("adminYourVoice.saveError")));
    } finally {
      setSaving(false);
    }
  }

  const changed = status !== feedback.status || reply.trim() !== String(feedback.admin_reply || "").trim();

  return (
    <aside className="fixed inset-0 z-50 flex justify-end bg-zinc-950/40" role="dialog" aria-modal="true">
      <button type="button" aria-label={i18nText("adminYourVoice.close")} onClick={onClose} className="flex-1" />
      <section className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">
              {label(YOUR_VOICE_TYPE_LABELS, feedback.feedback_type)} · {label(YOUR_VOICE_CATEGORY_LABELS, feedback.category)}
            </p>
            <h2 className="mt-0.5 text-xl font-black text-zinc-950">{feedback.title}</h2>
            <p className="mt-0.5 truncate text-sm font-bold text-zinc-600">{personName(feedback)}</p>
            <p className="mt-0.5 text-xs font-semibold text-zinc-400">
              {formatDateTime(feedback.created_at)}
              {feedback.current_screen ? ` · ${i18nText("adminYourVoice.sentFrom", { screen: feedback.current_screen })}` : ""}
            </p>
          </div>
          <button type="button" aria-label={i18nText("adminYourVoice.close")} onClick={onClose} className="grid h-9 w-9 flex-none place-items-center rounded-md text-zinc-400 hover:bg-zinc-100">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <p className={`whitespace-pre-wrap text-sm font-semibold leading-6 ${feedback.message ? "text-zinc-800" : "text-zinc-400"}`}>
            {feedback.message || i18nText("adminYourVoice.noMessage")}
          </p>

          {feedback.screenshot_url || feedback.voice_note_url ? (
            <div className="space-y-3">
              {attachments ? attachments.map((entry) => <Attachment key={entry.path} entry={entry} />) : <LoaderCircle className="animate-spin text-zinc-400" size={18} />}
            </div>
          ) : null}

          <div className="space-y-3 rounded-lg border border-zinc-200 p-4">
            <label className="block">
              <span className="text-xs font-black uppercase text-zinc-500">{i18nText("adminYourVoice.statusLabel")}</span>
              <select
                value={status}
                disabled={!canManage}
                onChange={(event) => setStatus(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm font-black outline-none focus:border-emerald-600 disabled:bg-zinc-50"
              >
                {YOUR_VOICE_STATUSES.map((value) => <option key={value} value={value}>{label(YOUR_VOICE_STATUS_LABELS, value)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase text-zinc-500">{i18nText("adminYourVoice.replyLabel")}</span>
              <textarea
                value={reply}
                disabled={!canManage}
                maxLength={2000}
                rows={4}
                onChange={(event) => setReply(event.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white p-3 text-sm font-semibold outline-none focus:border-emerald-600 disabled:bg-zinc-50"
              />
              <span className="mt-1 block text-xs font-semibold text-zinc-400">{i18nText(canManage ? "adminYourVoice.replyHint" : "adminYourVoice.readOnly")}</span>
            </label>
            {error ? <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{translateUi(error)}</p> : null}
            {message ? <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{message}</p> : null}
            {canManage ? (
              <button
                type="button"
                onClick={save}
                disabled={saving || !changed}
                className="flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800 disabled:opacity-40"
              >
                {saving ? <LoaderCircle className="animate-spin" size={15} /> : null} {i18nText("adminYourVoice.save")}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </aside>
  );
}

export default function YourVoiceView({ access }) {
  useUiLocale();
  const [tab, setTab] = useState("all");
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const canManage = canAccess(access, "support.manage", "explore");

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const next = await getYourVoiceFeedback({ limit: 400 });
      setRows(next);
      setSelected((current) => (current ? next.find((row) => row.id === current.id) || current : null));
    } catch (loadError) {
      setError(inlineErrorMessage(loadError, i18nText("adminYourVoice.loadError")));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdated = useCallback((updated) => {
    if (!updated?.id) return;
    setRows((current) => current.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
    setSelected((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
  }, []);

  const counts = useMemo(() => countYourVoice(rows), [rows]);
  const visible = useMemo(() => filterYourVoice(rows, { type: tab, status, search }), [rows, search, status, tab]);

  return (
    <>
      <PageHeading
        eyebrow={i18nText("adminYourVoice.eyebrow")}
        title={i18nText("adminYourVoice.title")}
        description={i18nText("adminYourVoice.description")}
        action={
          <button
            type="button"
            onClick={() => load(true)}
            className="flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-black text-zinc-700 hover:bg-zinc-50"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> {i18nText("ui.literals.k56e3badc4e6c")}
          </button>
        }
      />

      {error ? <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{translateUi(error)}</p> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label={i18nText("adminYourVoice.metricNew")} value={counts.newFeedback} detail={counts.unseen ? `${counts.unseen} · ${i18nText("adminYourVoice.metricUnseen")}` : ""} />
        <Metric label={translateUi(YOUR_VOICE_STATUS_LABELS.under_review)} value={counts.underReview} />
        <Metric label={translateUi(YOUR_VOICE_STATUS_LABELS.planned)} value={counts.planned} />
        <Metric label={i18nText("adminYourVoice.metricSafety")} value={counts.openSafety} />
        <Metric label={i18nText("adminYourVoice.openFilter")} value={counts.open} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const total = item.key === "all" ? rows.length : rows.filter((row) => row.feedback_type === item.key).length;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`flex h-10 items-center gap-2 rounded-md px-3 text-sm font-black ${
                tab === item.key ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              <Icon size={15} /> {translateUi(item.label)}
              <span className={tab === item.key ? "text-zinc-300" : "text-zinc-400"}>{total}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <span className="sr-only">{i18nText("adminYourVoice.searchLabel")}</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={i18nText("adminYourVoice.searchPlaceholder")}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-600"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm font-black outline-none focus:border-emerald-600 sm:w-56"
        >
          <option value="open">{i18nText("adminYourVoice.openFilter")}</option>
          <option value="all">{i18nText("adminYourVoice.allFilter")}</option>
          {YOUR_VOICE_STATUSES.map((value) => (
            <option key={value} value={value}>{label(YOUR_VOICE_STATUS_LABELS, value)}</option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {loading ? (
          <p className="flex items-center gap-2 p-5 text-sm font-bold text-zinc-500">
            <LoaderCircle className="animate-spin" size={16} /> {i18nText("adminYourVoice.loading")}
          </p>
        ) : !visible.length ? (
          <p className="p-8 text-center text-sm font-bold text-zinc-400">{i18nText("adminYourVoice.empty")}</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {visible.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-zinc-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-black text-zinc-950">{row.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${row.feedback_type === "safety" ? "bg-amber-50 text-amber-800" : "bg-zinc-100 text-zinc-600"}`}>
                        {label(YOUR_VOICE_TYPE_LABELS, row.feedback_type)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm font-bold text-zinc-700">
                      {personName(row)} · {label(YOUR_VOICE_CATEGORY_LABELS, row.category)}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-zinc-400">
                      {formatDateTime(row.created_at)} · {formatRelativeTime(row.updated_at || row.created_at)}
                    </p>
                  </div>
                  {!row.admin_seen ? <span className="h-2.5 w-2.5 flex-none rounded-full bg-red-600" title={i18nText("adminYourVoice.metricUnseen")} /> : null}
                  <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${STATUS_TONES[row.status] || "bg-zinc-100 text-zinc-600 ring-zinc-200"}`}>
                    {label(YOUR_VOICE_STATUS_LABELS, row.status)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected ? (
        <YourVoiceDrawer
          key={selected.id}
          feedback={selected}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      ) : null}
    </>
  );
}
