import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, ExternalLink, FileText, Image as ImageIcon, LoaderCircle, MessageSquareText, UserRoundCheck, X } from "lucide-react";
import { CASE_DECISIONS, CASE_STATUSES, formatCaseNumber, formatDateTime, titleCase } from "../adminConfig";
import { addCaseNote, applyCaseDecision, claimCase, getAdminCaseEvidence, getCaseActivity, reviewCaseApproval, transitionCase } from "../adminService";

export default function CaseDrawer({ item, access, onClose, onUpdated }) {
  const [activity, setActivity] = useState({ events: [], notes: [], approvals: [] });
  const [status, setStatus] = useState(item?.status || "new");
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState("resolve");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState([]);

  useEffect(() => {
    if (!item?.id) return;
    let active = true;
    getCaseActivity(item.id).then((value) => { if (active) setActivity(value); }).catch(() => null);
    return () => { active = false; };
  }, [item?.id]);

  useEffect(() => {
    if (!item?.id) return;
    let active = true;
    setEvidence([]);
    getAdminCaseEvidence(item).then((value) => { if (active) setEvidence(value); }).catch(() => { if (active) setEvidence([]); });
    return () => { active = false; };
  }, [item]);

  if (!item) return null;

  async function run(action, task) {
    setBusy(action);
    setError("");
    try {
      const updated = await task();
      if (updated?.id) onUpdated(updated);
    } catch (taskError) {
      setError(taskError.message || "The admin action failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveNote() {
    if (!note.trim()) return;
    await run("note", async () => {
      const created = await addCaseNote(item.id, note.trim());
      setActivity((current) => ({ ...current, notes: [created, ...current.notes] }));
      setNote("");
      return item;
    });
  }

  async function reviewApproval(approvalId, approved) {
    const reviewReason = window.prompt(approved ? "Reason for approving this action:" : "Reason for rejecting this action:");
    if (!reviewReason?.trim()) return;
    await run("approval", async () => {
      const updated = await reviewCaseApproval(approvalId, approved, reviewReason.trim(), item.id);
      setActivity((current) => ({ ...current, approvals: current.approvals.map((entry) => entry.id === approvalId ? { ...entry, status: approved ? "approved" : "rejected", review_note: reviewReason } : entry) }));
      return updated;
    });
  }

  const source = item.metadata?.source || {};
  const canManage = access.permissions.includes("cases.manage");

  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close case" onClick={onClose} className="absolute inset-0 bg-zinc-950/45" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-2xl">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-zinc-200 px-4 sm:px-6">
          <div>
            <p className="text-xs font-black text-emerald-700">{formatCaseNumber(item.case_number)}</p>
            <h2 className="mt-1 text-base font-black text-zinc-950">Case details</h2>
          </div>
          <button type="button" title="Close case" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"><X size={20} /></button>
        </header>

        <div className="kuntai-scrollbar-none flex-1 overflow-y-auto">
          <section className="border-b border-zinc-200 p-4 sm:p-6">
            <div className="flex flex-wrap gap-2 text-[11px] font-black">
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">{titleCase(item.sector)}</span>
              <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">{titleCase(item.queue)}</span>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">{titleCase(item.priority)}</span>
            </div>
            <h1 className="mt-4 text-xl font-black text-zinc-950">{item.title}</h1>
            <p className="mt-2 text-sm font-medium leading-6 text-zinc-600">{item.description || "No description was supplied."}</p>

            <dl className="mt-5 grid gap-4 border-t border-zinc-100 pt-5 sm:grid-cols-3">
              <div><dt className="text-[11px] font-black uppercase text-zinc-400">Status</dt><dd className="mt-1 text-sm font-bold text-zinc-800">{titleCase(item.status)}</dd></div>
              <div><dt className="text-[11px] font-black uppercase text-zinc-400">Opened</dt><dd className="mt-1 text-sm font-bold text-zinc-800">{formatDateTime(item.created_at)}</dd></div>
              <div><dt className="text-[11px] font-black uppercase text-zinc-400">SLA due</dt><dd className="mt-1 text-sm font-bold text-zinc-800">{formatDateTime(item.sla_due_at)}</dd></div>
            </dl>
          </section>

          {Object.keys(source).length ? (
            <section className="border-b border-zinc-200 p-4 sm:p-6">
              <h3 className="text-sm font-black text-zinc-950">Source information</h3>
              <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {Object.entries(source).filter(([, value]) => typeof value !== "object" && value !== null && value !== "").slice(0, 12).map(([key, value]) => (
                  <div key={key}><dt className="text-[11px] font-black uppercase text-zinc-400">{titleCase(key)}</dt><dd className="mt-1 break-words text-sm font-semibold text-zinc-800">{String(value)}</dd></div>
                ))}
              </dl>
            </section>
          ) : null}

          {evidence.length ? (
            <section className="border-b border-zinc-200 p-4 sm:p-6">
              <h3 className="text-sm font-black text-zinc-950">Documents and images</h3>
              <p className="mt-1 text-xs font-medium text-zinc-500">Submitted registration evidence available before verification begins.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {evidence.map((entry, index) => {
                  const image = /^data:image\//i.test(entry.url || "") || String(entry.contentType || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|heif)(\?|$)/i.test(entry.url || "");
                  return (
                    <article key={`${entry.url || entry.path}-${index}`} className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                      {image && entry.url ? <img src={entry.url} alt={entry.label} className="h-40 w-full bg-zinc-100 object-cover" /> : <div className="grid h-24 place-items-center bg-zinc-100 text-zinc-500">{image ? <ImageIcon size={28} /> : <FileText size={28} />}</div>}
                      <div className="p-3">
                        <p className="break-words text-xs font-black text-zinc-800">{titleCase(entry.label)}</p>
                        {entry.url ? <a href={entry.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:text-emerald-800"><ExternalLink size={13} /> Open evidence</a> : <p className="mt-2 text-xs font-semibold text-red-600">Evidence could not be opened.</p>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {activity.approvals?.length ? (
            <section className="border-b border-zinc-200 bg-amber-50/50 p-4 sm:p-6">
              <h3 className="text-sm font-black text-zinc-950">Sensitive action approvals</h3>
              <div className="mt-4 space-y-3">
                {activity.approvals.map((approval) => (
                  <article key={approval.id} className="rounded-lg border border-amber-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black text-zinc-900">{titleCase(approval.action_type?.replace("case_decision:", ""))}</p><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">{titleCase(approval.status)}</span></div>
                    <p className="mt-2 text-xs font-medium leading-5 text-zinc-600">{approval.request_note}</p>
                    {approval.status === "pending" && access.permissions.includes("cases.approve") && access.authorityLevel >= 4 ? <div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => reviewApproval(approval.id, true)} className="h-9 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50">Approve</button><button type="button" disabled={busy} onClick={() => reviewApproval(approval.id, false)} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50">Reject</button></div> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {canManage ? (
            <section className="border-b border-zinc-200 p-4 sm:p-6">
              <h3 className="text-sm font-black text-zinc-950">Case controls</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-800 focus:border-emerald-600 focus:outline-none">
                  {CASE_STATUSES.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
                </select>
                <button type="button" disabled={busy || status === item.status} onClick={() => run("status", () => transitionCase(item.id, status, reason))} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 text-sm font-black text-zinc-800 hover:bg-zinc-50 disabled:opacity-50">
                  {busy === "status" ? <LoaderCircle className="animate-spin" size={17} /> : <ClipboardCheck size={17} />} Update status
                </button>
              </div>
              {!item.assignee_user_id ? (
                <button type="button" disabled={busy} onClick={() => run("claim", () => claimCase(item.id))} className="mt-3 inline-flex h-11 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800 disabled:opacity-50">
                  {busy === "claim" ? <LoaderCircle className="animate-spin" size={17} /> : <UserRoundCheck size={17} />} Claim case
                </button>
              ) : null}

              <div className="mt-6 border-t border-zinc-100 pt-5">
                <p className="text-xs font-black uppercase text-zinc-500">Decision</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <select value={decision} onChange={(event) => setDecision(event.target.value)} className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-800 focus:border-emerald-600 focus:outline-none">
                    {CASE_DECISIONS.map((value) => <option key={value.key} value={value.key}>{value.label}</option>)}
                  </select>
                  <button type="button" disabled={busy || !reason.trim()} onClick={() => run("decision", () => applyCaseDecision(item.id, decision, reason.trim()))} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50">
                    {busy === "decision" ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCircle2 size={17} />} Apply decision
                  </button>
                </div>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Required decision reason" className="mt-3 w-full resize-none rounded-lg border border-zinc-300 p-3 text-sm font-medium text-zinc-900 focus:border-emerald-600 focus:outline-none" />
              </div>
            </section>
          ) : null}

          <section className="p-4 sm:p-6">
            <h3 className="text-sm font-black text-zinc-950">Internal notes</h3>
            {canManage ? (
              <div className="mt-4">
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Add context for the next administrator" className="w-full resize-none rounded-lg border border-zinc-300 p-3 text-sm font-medium text-zinc-900 focus:border-emerald-600 focus:outline-none" />
                <button type="button" disabled={busy || !note.trim()} onClick={saveNote} className="mt-2 inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 px-3 text-sm font-black text-zinc-800 hover:bg-zinc-50 disabled:opacity-50">
                  {busy === "note" ? <LoaderCircle className="animate-spin" size={16} /> : <MessageSquareText size={16} />} Add note
                </button>
              </div>
            ) : null}
            <div className="mt-5 space-y-3">
              {activity.notes.map((entry) => (
                <article key={entry.id} className="border-l-2 border-emerald-500 pl-3">
                  <p className="text-sm font-medium leading-6 text-zinc-700">{entry.body}</p>
                  <p className="mt-1 text-xs font-semibold text-zinc-400">{formatDateTime(entry.created_at)} · {titleCase(entry.visibility)}</p>
                </article>
              ))}
              {!activity.notes.length ? <p className="text-sm font-medium text-zinc-500">No internal notes yet.</p> : null}
            </div>
          </section>
        </div>

        {error ? <div role="alert" className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:px-6">{error}</div> : null}
      </aside>
    </div>
  );
}
