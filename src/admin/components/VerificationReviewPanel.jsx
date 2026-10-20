import { useState } from "react";
import { FilePlus2, FileText, History, Send } from "lucide-react";
import { formatDateTime, formatRelativeTime, titleCase } from "../adminConfig";
import {
  VERIFICATION_STAGES,
  changesSinceLastReview,
  formatWait,
  isContinuingCase,
  isWaitOverdue,
  requestableDocuments,
  reviewRound,
  verificationStage,
  waitingMs,
} from "../verificationStages.js";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";

const STAGE_BADGE_STYLES = {
  violet: "bg-violet-100 text-violet-800",
  sky: "bg-sky-100 text-sky-800",
  amber: "bg-amber-100 text-amber-900",
  zinc: "bg-zinc-200 text-zinc-700",
  emerald: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-700",
};

export function VerificationStageBadge({ item, className = "" }) {
  useUiLocale();
  const stage = VERIFICATION_STAGES[verificationStage(item)];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-black ${STAGE_BADGE_STYLES[stage.tone]} ${className}`}>{translateUi(stage.label)}</span>;
}

export function ReviewRoundChip({ item }) {
  useUiLocale();
  const continuing = isContinuingCase(item);
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-black ${continuing ? "bg-orange-50 text-orange-800" : "bg-zinc-100 text-zinc-600"}`}>
      {continuing ? `${translateUi("Continuing")} · ${translateUi("round")} ${reviewRound(item)}` : translateUi("First submission")}
    </span>
  );
}

export function WaitLabel({ item, now = Date.now() }) {
  useUiLocale();
  const stage = verificationStage(item);
  if (["approved", "rejected", "closed"].includes(stage)) return <span className="text-xs font-semibold text-zinc-400">{formatRelativeTime(item.resolved_at || item.updated_at)}</span>;
  const overdue = isWaitOverdue(item, now);
  const prefix = stage === "waiting_on_user" ? "Asked" : "Waiting";
  return <span className={`whitespace-nowrap text-xs font-black ${overdue ? "text-red-700" : "text-zinc-600"}`}>{translateUi(prefix)} {formatWait(waitingMs(item, now))}</span>;
}

// Status, history of document requests and what changed since the last look.
export default function VerificationReviewPanel({ item, events = [], requests = [] }) {
  useUiLocale();
  const stage = verificationStage(item);
  const changes = changesSinceLastReview(item);
  const latestRequest = requests[0] || null;
  const documentEvents = events.filter((event) => event.event_type === "document_added").slice(0, 8);

  const timeline = [
    { key: "submitted", at: item.created_at, title: "Submitted", detail: isContinuingCase(item) ? "" : "First submission" },
    ...requests.slice().reverse().map((request) => ({
      key: `request-${request.id}`,
      at: request.created_at,
      title: "More documents requested",
      detail: [request.requested_items?.length ? request.requested_items.join(", ") : "", request.note].filter(Boolean).join(" — "),
      answeredAt: request.answered_at,
    })),
    item.resubmitted_at ? { key: "resubmitted", at: item.resubmitted_at, title: "Applicant resubmitted", detail: "" } : null,
  ].filter(Boolean).sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));

  return (
    <section className="border-b border-zinc-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-black text-zinc-950">{translateUi("Verification status")}</h3>
        <VerificationStageBadge item={item} />
        <ReviewRoundChip item={item} />
        <WaitLabel item={item} />
      </div>
      <p className="mt-2 text-xs font-medium leading-5 text-zinc-500">{translateUi(VERIFICATION_STAGES[stage].detail)}</p>

      {stage === "waiting_on_user" && (latestRequest || item.resolution_note) ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs font-black uppercase text-zinc-500">{translateUi("Asked the applicant for")}</p>
          {latestRequest?.requested_items?.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {latestRequest.requested_items.map((entry) => <li key={entry} className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-zinc-700 ring-1 ring-zinc-200">{translateUi(entry)}</li>)}
            </ul>
          ) : null}
          <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-zinc-700">{latestRequest?.note || item.resolution_note}</p>
        </div>
      ) : null}

      {changes ? (
        <div className={`mt-4 rounded-lg border p-3 ${changes.hasChanges ? "border-violet-200 bg-violet-50" : "border-zinc-200 bg-zinc-50"}`}>
          <p className="flex items-center gap-1.5 text-xs font-black uppercase text-zinc-600"><FilePlus2 size={14} /> {translateUi("Changes since the last review")}{changes.since ? <span className="font-semibold normal-case text-zinc-400"> · {formatDateTime(changes.since)}</span> : null}</p>
          {changes.hasChanges ? (
            <ul className="mt-2 space-y-1 text-sm font-semibold text-zinc-800">
              {changes.addedDocuments.map((label, index) => <li key={`a-${label}-${index}`}><span className="text-violet-700">{translateUi("New document")}:</span> {translateUi(label)}</li>)}
              {changes.replacedDocuments.map((label, index) => <li key={`r-${label}-${index}`}><span className="text-violet-700">{translateUi("Replaced")}:</span> {translateUi(label)}</li>)}
              {changes.changedFields.slice(0, 8).map((field) => (
                <li key={field.key} className="break-words"><span className="text-violet-700">{titleCase(field.key)}:</span> <span className="text-zinc-400 line-through">{field.before || "—"}</span> → {field.after || "—"}</li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm font-medium text-zinc-500">{translateUi("Nothing has changed since the last review.")}</p>}
        </div>
      ) : null}

      {documentEvents.length ? (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-xs font-black uppercase text-zinc-500"><FileText size={14} /> {translateUi("Recent uploads")}</p>
          <ul className="mt-2 space-y-1">
            {documentEvents.map((event) => <li key={event.id} className="flex justify-between gap-3 text-xs font-semibold text-zinc-700"><span>{translateUi(event.summary)}</span><span className="shrink-0 text-zinc-400">{formatRelativeTime(event.created_at)}</span></li>)}
          </ul>
        </div>
      ) : null}

      {timeline.length > 1 ? (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-xs font-black uppercase text-zinc-500"><History size={14} /> {translateUi("Review history")}</p>
          <ol className="mt-2 space-y-2 border-l-2 border-zinc-200 pl-3">
            {timeline.map((entry) => (
              <li key={entry.key}>
                <p className="text-xs font-black text-zinc-800">{translateUi(entry.title)} <span className="font-semibold text-zinc-400">· {formatDateTime(entry.at)}</span></p>
                {entry.detail ? <p className="mt-0.5 text-xs font-medium leading-5 text-zinc-600">{translateUi(entry.detail)}</p> : null}
                {entry.answeredAt ? <p className="mt-0.5 text-[11px] font-bold text-emerald-700">{translateUi("Answered")} {formatRelativeTime(entry.answeredAt)}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

// Checklist of documents to ask for, plus anything else the admin types.
export function RequestDocumentsPicker({ item, selected = [], onChange }) {
  useUiLocale();
  const [other, setOther] = useState("");
  const options = requestableDocuments(item);
  const extras = selected.filter((entry) => !options.includes(entry));
  function toggle(entry) {
    onChange(selected.includes(entry) ? selected.filter((value) => value !== entry) : [...selected, entry]);
  }
  function addOther() {
    const value = other.trim();
    if (!value) return;
    if (!selected.includes(value)) onChange([...selected, value]);
    setOther("");
  }
  return (
    <fieldset className="mt-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
      <legend className="px-1 text-xs font-black text-sky-900">{translateUi("Which documents are needed?")}</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {[...options, ...extras].map((entry) => (
          <label key={entry} className="flex min-h-9 items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-800 ring-1 ring-sky-100">
            <input type="checkbox" checked={selected.includes(entry)} onChange={() => toggle(entry)} className="accent-sky-700" />
            {translateUi(entry)}
          </label>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={other} onChange={(event) => setOther(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOther(); } }} placeholder={translateUi("Something else…")} className="h-9 min-w-0 flex-1 rounded-md border border-sky-200 bg-white px-2.5 text-xs font-semibold outline-none focus:border-sky-600" />
        <button type="button" onClick={addOther} disabled={!other.trim()} className="inline-flex h-9 items-center gap-1 rounded-md border border-sky-300 bg-white px-2.5 text-xs font-black text-sky-800 hover:bg-sky-50 disabled:opacity-50"><Send size={13} /> {translateUi("Add")}</button>
      </div>
      <p className="mt-2 text-[11px] font-semibold leading-4 text-sky-900/80">{translateUi("The applicant gets a notification with this list and your note. When they upload, the case comes back as Resubmitted.")}</p>
    </fieldset>
  );
}
