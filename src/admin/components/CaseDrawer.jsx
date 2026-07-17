import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, ExternalLink, FileAudio, FileText, FileVideo, Image as ImageIcon, LoaderCircle, MessageSquareText, RotateCcw, ShieldCheck, ShieldOff, SlidersHorizontal, UserRoundCheck, X } from "lucide-react";
import { ADMIN_SECTORS, CASE_DECISIONS, CASE_STATUSES, formatCaseNumber, formatDateTime, formatRelativeTime, titleCase } from "../adminConfig";
import { addCaseNote, applyCaseDecision, claimCase, getAdminAccountControl, getAdminCaseContent, getAdminCaseEvidence, getCaseActionHistory, getCaseActivity, getCaseCountryLabel, getCaseTypeLabel, reviewCaseApproval, setAdminUserStatus, transitionCase, undoCaseAction } from "../adminService";
import { showToast } from "../../Backend/services/toastService";

export default function CaseDrawer({ item, access, onClose, onUpdated }) {
  const [activity, setActivity] = useState({ events: [], notes: [], approvals: [] });
  const [status, setStatus] = useState(item?.status || "new");
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState("resolve");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState([]);
  const [caseContent, setCaseContent] = useState([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [caseActions, setCaseActions] = useState([]);
  const [undoDraft, setUndoDraft] = useState(null);
  const [accountControl, setAccountControl] = useState(null);
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [accountForm, setAccountForm] = useState({ status: "active", reason: "", sectors: ["all"], expiresAt: "" });

  useEffect(() => {
    if (!item?.id) return;
    let active = true;
    getCaseActivity(item.id).then((value) => { if (active) setActivity(value); }).catch(() => null);
    getCaseActionHistory(item.id).then((value) => { if (active) setCaseActions(value); }).catch(() => { if (active) setCaseActions([]); });
    return () => { active = false; };
  }, [item?.id]);

  useEffect(() => {
    if (!item?.subject_user_id) {
      setAccountControl(null);
      return undefined;
    }
    let active = true;
    getAdminAccountControl(item.subject_user_id)
      .then((value) => {
        if (!active) return;
        setAccountControl(value);
        setAccountForm({
          status: value?.status || "active",
          reason: value?.reason || "",
          sectors: value?.restricted_sectors?.length ? value.restricted_sectors : ["all"],
          expiresAt: value?.expires_at ? value.expires_at.slice(0, 16) : "",
        });
      })
      .catch(() => {
        if (active) setAccountControl(null);
      });
    return () => { active = false; };
  }, [item?.subject_user_id]);

  useEffect(() => {
    if (!item?.id) return;
    let active = true;
    setEvidence([]);
    setCaseContent([]);
    setContentLoading(true);
    getAdminCaseEvidence(item).then((value) => { if (active) setEvidence(value); }).catch(() => { if (active) setEvidence([]); });
    getAdminCaseContent(item).then((value) => { if (active) setCaseContent(value); }).catch(() => { if (active) setCaseContent([]); }).finally(() => { if (active) setContentLoading(false); });
    return () => { active = false; };
  }, [item]);

  if (!item) return null;

  async function run(action, task, onSuccess) {
    setBusy(action);
    setError("");
    try {
      const updated = await task();
      if (updated?.id) onUpdated(updated);
      onSuccess?.(updated);
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

  async function refreshCaseActions() {
    if (!item?.id) return;
    try {
      const actions = await getCaseActionHistory(item.id);
      setCaseActions(actions);
    } catch {
      setCaseActions([]);
    }
  }

  async function submitUndoAction() {
    if (!undoDraft?.action || !undoDraft.reason.trim()) return;
    await run("undo-action", async () => {
      const updated = await undoCaseAction(item.id, undoDraft.action.id, undoDraft.reason.trim());
      await refreshCaseActions();
      setUndoDraft(null);
      setStatus(updated.status);
      showToast("Case action undone.", "success", { title: "Admin case updated" });
      return updated;
    });
  }

  function toggleAccountSector(value) {
    setAccountForm((current) => {
      if (value === "all") return { ...current, sectors: ["all"] };
      const withoutAll = current.sectors.filter((entry) => entry !== "all");
      const sectors = withoutAll.includes(value) ? withoutAll.filter((entry) => entry !== value) : [...withoutAll, value];
      return { ...current, sectors: sectors.length ? sectors : ["all"] };
    });
  }

  async function saveAccountAccess(nextPatch = {}) {
    const next = { ...accountForm, ...nextPatch };
    if (!item.subject_user_id || !next.reason.trim()) return;
    await run("account-access", async () => {
      const updated = await setAdminUserStatus({
        userId: item.subject_user_id,
        status: next.status,
        reason: next.reason.trim(),
        sectors: next.status === "restricted" ? next.sectors : ["all"],
        expiresAt: next.expiresAt || null,
      });
      setAccountControl(updated);
      setAccountForm({
        status: updated.status || "active",
        reason: updated.reason || "",
        sectors: updated.restricted_sectors?.length ? updated.restricted_sectors : ["all"],
        expiresAt: updated.expires_at ? updated.expires_at.slice(0, 16) : "",
      });
      setAccountFormOpen(false);
      showToast("Account access updated.", "success", { title: "Related account" });
      return item;
    });
  }

  async function restoreAccountAccess() {
    const fallbackReason = `Account access restored from ${formatCaseNumber(item.case_number)}.`;
    await saveAccountAccess({
      status: "active",
      reason: fallbackReason,
      sectors: ["all"],
      expiresAt: "",
    });
  }

  const source = item.metadata?.source || {};
  const canManage = access.permissions.includes("cases.manage");
  const canManageUsers = access.permissions.includes("users.manage");

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

            <dl className="mt-5 grid gap-4 border-t border-zinc-100 pt-5 sm:grid-cols-2 lg:grid-cols-5">
              <div><dt className="text-[11px] font-black uppercase text-zinc-400">Status</dt><dd className="mt-1 text-sm font-bold text-zinc-800">{titleCase(item.status)}</dd></div>
              <div><dt className="text-[11px] font-black uppercase text-zinc-400">Type</dt><dd className="mt-1 text-sm font-bold text-zinc-800">{getCaseTypeLabel(item)}</dd></div>
              <div><dt className="text-[11px] font-black uppercase text-zinc-400">Country</dt><dd className="mt-1 text-sm font-bold text-zinc-800">{getCaseCountryLabel(item)}</dd></div>
              <div><dt className="text-[11px] font-black uppercase text-zinc-400">Opened</dt><dd className="mt-1 text-sm font-bold text-zinc-800">{formatDateTime(item.created_at)}</dd></div>
              <div><dt className="text-[11px] font-black uppercase text-zinc-400">SLA due</dt><dd className="mt-1 text-sm font-bold text-zinc-800">{formatDateTime(item.sla_due_at)}</dd></div>
            </dl>
          </section>

          <section className="border-b border-zinc-200 bg-zinc-50/60 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-zinc-950">Reported or attached content</h3>
                <p className="mt-1 text-xs font-medium text-zinc-500">Open the source content and any attached media directly from this case.</p>
              </div>
              {contentLoading ? <LoaderCircle className="animate-spin text-zinc-400" size={18} /> : null}
            </div>
            <div className="mt-4 space-y-3">
              {caseContent.map((entry, index) => (
                <ContentPreview key={`${entry.type}-${entry.id || index}`} entry={entry} onOpenMedia={setSelectedMedia} />
              ))}
              {!contentLoading && !caseContent.length ? <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm font-semibold text-zinc-500">No source content was resolved for this case.</p> : null}
            </div>
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
              <h3 className="text-sm font-black text-zinc-950">Attachments and evidence</h3>
              <p className="mt-1 text-xs font-medium text-zinc-500">Submitted files, screenshots, recordings, and verification documents connected to this case.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {evidence.map((entry, index) => <EvidenceTile key={`${entry.url || entry.path}-${index}`} entry={entry} onOpenMedia={setSelectedMedia} />)}
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
                <button type="button" disabled={busy || status === item.status} onClick={() => run("status", () => transitionCase(item.id, status, reason), (updated) => { setStatus(updated.status); refreshCaseActions(); })} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 text-sm font-black text-zinc-800 hover:bg-zinc-50 disabled:opacity-50">
                  {busy === "status" ? <LoaderCircle className="animate-spin" size={17} /> : <ClipboardCheck size={17} />} Update status
                </button>
              </div>
              {!item.assignee_user_id ? (
                <button type="button" disabled={busy} onClick={() => run("claim", () => claimCase(item.id), refreshCaseActions)} className="mt-3 inline-flex h-11 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800 disabled:opacity-50">
                  {busy === "claim" ? <LoaderCircle className="animate-spin" size={17} /> : <UserRoundCheck size={17} />} Claim case
                </button>
              ) : null}

              {caseActions.length ? (
                <div className="mt-6 border-t border-zinc-100 pt-5">
                  <p className="text-xs font-black uppercase text-zinc-500">Recent actions</p>
                  <div className="mt-3 space-y-3">
                    {caseActions.slice(0, 3).map((action) => {
                      const actionTitle = titleCase(action.action_key?.replaceAll(".", " ") || "Admin action");
                      const undoOpen = undoDraft?.action?.id === action.id;
                      return (
                        <article key={action.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-black text-zinc-950">{actionTitle}</p>
                                {action.undo_status === "undone" ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800">Undone</span> : null}
                              </div>
                              <p className="mt-1 text-xs font-semibold text-zinc-500">{action.reason || "No reason recorded"} - {formatRelativeTime(action.created_at)}</p>
                            </div>
                            {action.can_undo ? (
                              <button type="button" disabled={busy} onClick={() => setUndoDraft({ action, reason: "" })} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50">
                                <RotateCcw size={15} /> Undo
                              </button>
                            ) : null}
                          </div>
                          {undoOpen ? (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <p className="text-xs font-bold leading-5 text-amber-900">Undo restores the case to its previous status, assignee, and decision state. If this action caused an account restriction, also check Related account access below.</p>
                              <textarea value={undoDraft.reason} onChange={(event) => setUndoDraft((current) => current ? { ...current, reason: event.target.value } : current)} rows={2} placeholder="Required undo reason" className="mt-2 w-full resize-none rounded-lg border border-amber-200 bg-white p-2.5 text-sm font-medium text-zinc-900 focus:border-amber-500 focus:outline-none" />
                              <div className="mt-2 flex justify-end gap-2">
                                <button type="button" disabled={busy} onClick={() => setUndoDraft(null)} className="h-9 rounded-lg px-3 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-50">Cancel</button>
                                <button type="button" disabled={busy || !undoDraft.reason.trim()} onClick={submitUndoAction} className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-700 px-3 text-xs font-black text-white hover:bg-amber-800 disabled:opacity-50">
                                  {busy === "undo-action" ? <LoaderCircle className="animate-spin" size={15} /> : <RotateCcw size={15} />} Confirm undo
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {canManageUsers && item.subject_user_id ? (
                <div className="mt-6 border-t border-zinc-100 pt-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-zinc-500">Related account access</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-black ${!accountControl || accountControl.status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
                          {!accountControl || accountControl.status === "active" ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
                          {titleCase(accountControl?.status || "active")}
                        </span>
                        {accountControl?.restricted_sectors?.length ? <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-black text-zinc-600">{accountControl.restricted_sectors.join(", ")}</span> : null}
                      </div>
                      {accountControl?.reason ? <p className="mt-2 text-xs font-semibold leading-5 text-zinc-500">{accountControl.reason}</p> : <p className="mt-2 text-xs font-semibold leading-5 text-zinc-500">No active restriction is recorded for this user.</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {accountControl && accountControl.status !== "active" ? (
                        <button type="button" disabled={busy} onClick={restoreAccountAccess} className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50">
                          {busy === "account-access" ? <LoaderCircle className="animate-spin" size={15} /> : <RotateCcw size={15} />} Restore
                        </button>
                      ) : null}
                      <button type="button" disabled={busy} onClick={() => setAccountFormOpen((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-300 px-3 text-xs font-black text-zinc-800 hover:bg-zinc-50 disabled:opacity-50">
                        <SlidersHorizontal size={15} /> Edit
                      </button>
                    </div>
                  </div>
                  {accountFormOpen ? (
                    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block"><span className="mb-1.5 block text-xs font-black text-zinc-600">Status</span><select value={accountForm.status} onChange={(event) => setAccountForm((current) => ({ ...current, status: event.target.value }))} className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-bold"><option value="active">Active</option><option value="warned">Warned</option><option value="restricted">Restricted</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select></label>
                        <label className="block"><span className="mb-1.5 block text-xs font-black text-zinc-600">Expires optional</span><input type="datetime-local" value={accountForm.expiresAt} onChange={(event) => setAccountForm((current) => ({ ...current, expiresAt: event.target.value }))} className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold" /></label>
                      </div>
                      {accountForm.status === "restricted" ? (
                        <fieldset className="mt-3">
                          <legend className="text-xs font-black text-zinc-600">Restricted sectors</legend>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {ADMIN_SECTORS.map((sector) => (
                              <label key={sector.value} className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold">
                                <input type="checkbox" checked={accountForm.sectors.includes(sector.value)} onChange={() => toggleAccountSector(sector.value)} className="accent-emerald-700" />
                                {sector.label}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ) : null}
                      <textarea value={accountForm.reason} onChange={(event) => setAccountForm((current) => ({ ...current, reason: event.target.value }))} rows={2} placeholder="Required account access reason" className="mt-3 w-full resize-none rounded-lg border border-zinc-300 bg-white p-2.5 text-sm font-medium text-zinc-900 focus:border-emerald-600 focus:outline-none" />
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" disabled={busy} onClick={() => setAccountFormOpen(false)} className="h-9 rounded-lg px-3 text-xs font-black text-zinc-600 hover:bg-white disabled:opacity-50">Cancel</button>
                        <button type="button" disabled={busy || !accountForm.reason.trim()} onClick={() => saveAccountAccess()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-950 px-3 text-xs font-black text-white hover:bg-zinc-800 disabled:opacity-50">
                          {busy === "account-access" ? <LoaderCircle className="animate-spin" size={15} /> : <ShieldCheck size={15} />} Save access
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-6 border-t border-zinc-100 pt-5">
                <p className="text-xs font-black uppercase text-zinc-500">Decision</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <select value={decision} onChange={(event) => setDecision(event.target.value)} className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-800 focus:border-emerald-600 focus:outline-none">
                    {CASE_DECISIONS.map((value) => <option key={value.key} value={value.key}>{value.label}</option>)}
                  </select>
                  <button type="button" disabled={busy || !reason.trim()} onClick={() => run("decision", () => applyCaseDecision(item.id, decision, reason.trim()), () => {
                    showToast("Decision applied.", "success", { title: "Admin case updated" });
                    onClose();
                  })} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50">
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
      {selectedMedia ? <MediaLightbox media={selectedMedia} onClose={() => setSelectedMedia(null)} /> : null}
    </div>
  );
}

function mediaKind(entry = {}) {
  if (entry.kind) return entry.kind;
  const value = `${entry.contentType || ""} ${entry.url || ""} ${entry.path || ""}`.toLowerCase();
  if (/image\//.test(value) || /\.(png|jpe?g|webp|gif|heic|heif|avif)(\?|$)/i.test(value)) return "image";
  if (/video\//.test(value) || /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(value)) return "video";
  if (/audio\//.test(value) || /\.(mp3|m4a|wav|ogg|webm)(\?|$)/i.test(value)) return "audio";
  return "document";
}

function MediaIcon({ kind }) {
  if (kind === "image") return <ImageIcon size={24} />;
  if (kind === "video") return <FileVideo size={24} />;
  if (kind === "audio") return <FileAudio size={24} />;
  return <FileText size={24} />;
}

function MediaTile({ entry, compact = false, onOpenMedia }) {
  const kind = mediaKind(entry);
  const label = entry.label || "Attachment";
  if (!entry.url) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-700">
        {label} could not be opened.
      </div>
    );
  }
  if (kind === "image") {
    return (
      <button type="button" onClick={() => onOpenMedia?.({ ...entry, kind })} className={`overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm ${compact ? "min-w-52" : ""}`}>
        <img src={entry.url} alt={label} className={`${compact ? "h-36" : "h-44"} w-full bg-zinc-100 object-cover`} />
        <p className="break-words p-3 text-xs font-black text-zinc-800">{titleCase(label)}</p>
      </button>
    );
  }
  if (kind === "video") {
    return (
      <article className={`overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm ${compact ? "min-w-72" : ""}`}>
        <video src={entry.url} controls preload="metadata" className={`${compact ? "h-36" : "h-44"} w-full bg-black object-contain`} />
        <p className="break-words p-3 text-xs font-black text-zinc-800">{titleCase(label)}</p>
      </article>
    );
  }
  if (kind === "audio") {
    return (
      <article className={`rounded-xl border border-zinc-200 bg-white p-3 shadow-sm ${compact ? "min-w-72" : ""}`}>
        <div className="mb-3 flex items-center gap-2 text-xs font-black text-zinc-800"><FileAudio size={17} /> {titleCase(label)}</div>
        <audio src={entry.url} controls className="w-full" />
      </article>
    );
  }
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-black text-zinc-800"><MediaIcon kind={kind} /> {titleCase(label)}</div>
      <a href={entry.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:text-emerald-800"><ExternalLink size={13} /> Open file</a>
    </article>
  );
}

function EvidenceTile({ entry, onOpenMedia }) {
  return <MediaTile entry={entry} onOpenMedia={onOpenMedia} />;
}

function ContentPreview({ entry, onOpenMedia }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase text-emerald-700">{titleCase(entry.type || "content")}</p>
          <h4 className="mt-1 text-base font-black text-zinc-950">{entry.title || "Case content"}</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-zinc-600">{entry.description || "No written content was supplied."}</p>
        </div>
      </div>
      {entry.meta?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {entry.meta.map((meta) => <span key={meta} className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-black text-zinc-600">{meta}</span>)}
        </div>
      ) : null}
      {entry.mapUrl ? (
        <a href={entry.mapUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-xs font-black text-emerald-700 hover:bg-emerald-50">
          <ExternalLink size={14} /> Open map point
        </a>
      ) : null}
      {entry.media?.length ? (
        <div className="kuntai-scrollbar-none mt-4 flex max-h-72 gap-3 overflow-x-auto pb-2">
          {entry.media.map((media, index) => <MediaTile key={`${media.url || media.label}-${index}`} entry={media} compact onOpenMedia={onOpenMedia} />)}
        </div>
      ) : null}
    </article>
  );
}

function MediaLightbox({ media, onClose }) {
  const kind = mediaKind(media);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/75 p-4">
      <button type="button" aria-label="Close media preview" onClick={onClose} className="absolute inset-0" />
      <section className="relative z-10 w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <p className="truncate text-sm font-black text-zinc-900">{titleCase(media.label || "Media preview")}</p>
          <button type="button" title="Close preview" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
        </header>
        <div className="max-h-[78vh] overflow-auto bg-zinc-950 p-3">
          {kind === "image" ? <img src={media.url} alt={media.label || "Preview"} className="mx-auto max-h-[72vh] object-contain" /> : null}
          {kind === "video" ? <video src={media.url} controls autoPlay className="mx-auto max-h-[72vh] w-full bg-black object-contain" /> : null}
          {kind === "audio" ? <div className="rounded-lg bg-white p-4"><audio src={media.url} controls autoPlay className="w-full" /></div> : null}
        </div>
      </section>
    </div>
  );
}
