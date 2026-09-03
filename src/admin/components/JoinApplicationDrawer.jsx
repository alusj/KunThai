import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, LoaderCircle, Send, X } from "lucide-react";

import { formatDateTime, titleCase } from "../adminConfig";
import {
  addJoinAdminNote,
  assignJoinAssessment,
  createJoinDocumentUrl,
  getJoinApplicationDetail,
  getJoinQuestionCatalogue,
  JOIN_STATUSES,
  markJoinApplicationRead,
  postJoinApplicationMessage,
  saveJoinReview,
  scoreAreasFor,
  scoreJoinApplication,
  setJoinApplicationPriority,
  setJoinApplicationStatus,
  weightedScore,
} from "../joinKunThaiAdminService";

const TABS = [
  ["application", "Application"],
  ["conversation", "Conversation"],
  ["review", "Review"],
];

const PROFICIENCY_LABELS = {
  beginner: "Beginner",
  basic: "Basic",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

function describeValue(value, optionLabels) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((entry) => optionLabels?.get(entry) || titleCase(String(entry))).join(", ");
  return optionLabels?.get(String(value)) || String(value);
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="border-t border-zinc-100 py-2.5 first:border-0 first:pt-0">
      <p className="text-[11px] font-black uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-800">{value}</p>
    </div>
  );
}

function DocumentLink({ document }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    const url = await createJoinDocumentUrl(document.storage_path);
    setBusy(false);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="flex w-full items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-left text-sm font-bold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
    >
      <FileText size={16} className="flex-none text-zinc-400" />
      <span className="min-w-0 flex-1 truncate">{document.file_name || "Attachment"}</span>
      <span className="flex-none text-[11px] font-black uppercase text-zinc-400">{titleCase(document.document_type)}</span>
    </button>
  );
}

export default function JoinApplicationDrawer({ application, canManage, canDecide, onClose, onUpdated }) {
  const [detail, setDetail] = useState(null);
  const [catalogue, setCatalogue] = useState(null);
  const [tab, setTab] = useState("application");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [statusChoice, setStatusChoice] = useState(application.status);
  const [statusReason, setStatusReason] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [ratings, setRatings] = useState({});
  const [recommendation, setRecommendation] = useState("undecided");
  const [strengths, setStrengths] = useState("");
  const [concerns, setConcerns] = useState("");
  const [assessmentTitle, setAssessmentTitle] = useState("KunThai assessment");
  const [assessmentPrompt, setAssessmentPrompt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextDetail, nextCatalogue] = await Promise.all([
        getJoinApplicationDetail(application.id),
        getJoinQuestionCatalogue(application.application_type),
      ]);
      setDetail(nextDetail);
      setCatalogue(nextCatalogue);
    } catch (loadError) {
      setError(loadError.message || "Unable to load this application.");
    } finally {
      setLoading(false);
    }
  }, [application.id, application.application_type]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setStatusChoice(application.status);
  }, [application.status]);

  useEffect(() => {
    if (application.admin_unread_count) markJoinApplicationRead(application.id).catch(() => null);
  }, [application.admin_unread_count, application.id]);

  const areas = scoreAreasFor(application.application_type);
  const suggestedScore = useMemo(() => weightedScore(application.application_type, ratings), [application.application_type, ratings]);

  const sections = useMemo(() => {
    if (!catalogue) return [];
    const grouped = [];
    const byKey = new Map();
    for (const question of catalogue.questions) {
      if (question.input_type === "statement") continue;
      let section = byKey.get(question.section_key);
      if (!section) {
        section = { key: question.section_key, title: question.section_title, questions: [] };
        byKey.set(question.section_key, section);
        grouped.push(section);
      }
      section.questions.push(question);
    }
    return grouped;
  }, [catalogue]);

  async function run(task, successMessage) {
    setBusy(true);
    setError("");
    try {
      const updated = await task();
      if (updated && updated.id) onUpdated(updated);
      await load();
      if (successMessage) setError("");
      return updated;
    } catch (taskError) {
      setError(taskError.message || "That action could not be completed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const decisionStatus = ["accepted", "rejected"].includes(statusChoice);

  return (
    <aside className="fixed inset-0 z-50 flex justify-end bg-zinc-950/40" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="flex-1" />
      <section className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">
              {titleCase(application.application_type)} application
            </p>
            <h2 className="mt-0.5 text-xl font-black text-zinc-950">{application.reference}</h2>
            <p className="mt-0.5 truncate text-sm font-bold text-zinc-600">
              {application.display_name || "Applicant"}
              {application.headline ? ` · ${application.headline}` : ""}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-zinc-400">
              Submitted {formatDateTime(application.submitted_at)}
              {application.country ? ` · ${application.country}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 flex-none place-items-center rounded-md text-zinc-400 hover:bg-zinc-100">
            <X size={18} />
          </button>
        </header>

        <nav className="flex gap-1 border-b border-zinc-200 px-4">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`h-11 px-3 text-sm font-black ${tab === key ? "border-b-2 border-emerald-700 text-emerald-800" : "text-zinc-500 hover:text-zinc-800"}`}
            >
              {label}
              {key === "conversation" && application.admin_unread_count ? (
                <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{application.admin_unread_count}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-5">
          {error ? <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
          {loading ? (
            <p className="flex items-center gap-2 text-sm font-bold text-zinc-500">
              <LoaderCircle className="animate-spin" size={16} /> Loading application…
            </p>
          ) : null}

          {!loading && detail && tab === "application" ? (
            <div className="space-y-5">
              {sections.map((section) => {
                const rows = section.questions
                  .map((question) => ({
                    label: question.label,
                    value: describeValue(detail.answers[question.question_key], catalogue.optionsByKey.get(question.question_key)),
                  }))
                  .filter((row) => row.value);
                if (!rows.length) return null;
                return (
                  <section key={section.key}>
                    <h3 className="text-[11px] font-black uppercase tracking-wide text-emerald-700">{section.title}</h3>
                    <div className="mt-2 rounded-lg border border-zinc-200 p-4">
                      {rows.map((row) => <Field key={row.label} label={row.label} value={row.value} />)}
                    </div>
                  </section>
                );
              })}

              {detail.education.length ? (
                <section>
                  <h3 className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Qualifications</h3>
                  <ul className="mt-2 space-y-2">
                    {detail.education.map((entry) => (
                      <li key={entry.id} className="rounded-lg border border-zinc-200 p-3">
                        <p className="text-sm font-black text-zinc-950">{entry.qualification || titleCase(entry.level) || "Qualification"}</p>
                        <p className="text-xs font-bold text-zinc-500">
                          {[entry.institution, entry.country, entry.field_of_study].filter(Boolean).join(" · ")}
                        </p>
                        <p className="text-xs font-semibold text-zinc-400">
                          {[entry.start_year, entry.currently_studying ? "present" : entry.end_year].filter(Boolean).join(" – ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {detail.experience.length ? (
                <section>
                  <h3 className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Experience</h3>
                  <ul className="mt-2 space-y-2">
                    {detail.experience.map((entry) => (
                      <li key={entry.id} className="rounded-lg border border-zinc-200 p-3">
                        <p className="text-sm font-black text-zinc-950">{entry.position_title || "Role"}</p>
                        <p className="text-xs font-bold text-zinc-500">{entry.organization}</p>
                        <p className="text-xs font-semibold text-zinc-400">
                          {[entry.start_date, entry.currently_here ? "present" : entry.end_date].filter(Boolean).join(" – ")}
                          {entry.may_contact ? " · may contact" : ""}
                        </p>
                        {entry.responsibilities ? (
                          <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-700">{entry.responsibilities}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {detail.skills.length ? (
                <section>
                  <h3 className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Skills</h3>
                  <ul className="mt-2 space-y-2">
                    {detail.skills.map((entry) => (
                      <li key={entry.id} className="rounded-lg border border-zinc-200 p-3">
                        <p className="text-sm font-black text-zinc-950">
                          {entry.skill} · {PROFICIENCY_LABELS[entry.proficiency] || titleCase(entry.proficiency)}
                        </p>
                        {entry.years_experience ? (
                          <p className="text-xs font-bold text-zinc-500">{titleCase(entry.years_experience)}</p>
                        ) : null}
                        {entry.context ? <p className="mt-1 text-sm font-semibold leading-6 text-zinc-700">{entry.context}</p> : null}
                        {entry.evidence_url ? (
                          <a href={entry.evidence_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs font-black text-emerald-800">
                            {entry.evidence_url}
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {detail.documents.length ? (
                <section>
                  <h3 className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Documents</h3>
                  <div className="mt-2 space-y-2">
                    {detail.documents.map((document) => <DocumentLink key={document.id} document={document} />)}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {!loading && detail && tab === "conversation" ? (
            <div className="space-y-5">
              <section className="space-y-3">
                {detail.messages.length ? (
                  detail.messages.map((message) => {
                    const fromTeam = message.sender_role === "recruitment";
                    return (
                      <div key={message.id} className={`flex ${fromTeam ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-lg px-3 py-2 ${fromTeam ? "bg-emerald-700 text-white" : "bg-zinc-100 text-zinc-900"}`}>
                          <p className="whitespace-pre-wrap text-sm font-semibold leading-6">{message.body}</p>
                          <p className={`mt-1 text-[10px] font-bold ${fromTeam ? "text-emerald-100" : "text-zinc-400"}`}>
                            {fromTeam ? "KunThai" : "Applicant"} · {formatDateTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-5 text-center text-sm font-bold text-zinc-400">
                    No messages yet.
                  </p>
                )}
              </section>

              {canManage ? (
                <section className="rounded-lg border border-zinc-200 p-4">
                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-wide text-zinc-500">Reply to the applicant</span>
                    <textarea
                      rows={3}
                      maxLength={4000}
                      value={messageBody}
                      onChange={(event) => setMessageBody(event.target.value)}
                      className="mt-2 w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-600 focus:bg-white"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || !messageBody.trim()}
                    onClick={async () => {
                      const sent = await run(() => postJoinApplicationMessage(application.id, messageBody.trim()));
                      if (sent) setMessageBody("");
                    }}
                    className="mt-3 flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-black text-white disabled:opacity-40"
                  >
                    <Send size={15} /> Send
                  </button>
                </section>
              ) : null}

              <section className="rounded-lg border border-zinc-200 p-4">
                <h3 className="text-sm font-black text-zinc-950">Assessments</h3>
                {detail.assessments.length ? (
                  <ul className="mt-3 space-y-2">
                    {detail.assessments.map((assessment) => (
                      <li key={assessment.id} className="rounded-md border border-zinc-200 p-3">
                        <p className="text-sm font-black text-zinc-950">{assessment.title}</p>
                        <p className="text-[11px] font-black uppercase text-zinc-400">
                          {titleCase(assessment.status)} · assigned {formatDateTime(assessment.assigned_at)}
                        </p>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-600">{assessment.prompt}</p>
                        {assessment.response ? (
                          <div className="mt-2 rounded-md bg-zinc-50 p-3">
                            <p className="text-[11px] font-black uppercase text-zinc-400">Answer</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-800">{assessment.response}</p>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm font-bold text-zinc-400">No assessment sent yet.</p>
                )}

                {canManage ? (
                  <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4">
                    <input
                      value={assessmentTitle}
                      onChange={(event) => setAssessmentTitle(event.target.value)}
                      placeholder="Assessment title"
                      className="h-10 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm font-bold outline-none focus:border-emerald-600 focus:bg-white"
                    />
                    <textarea
                      rows={4}
                      value={assessmentPrompt}
                      onChange={(event) => setAssessmentPrompt(event.target.value)}
                      placeholder="Describe the scenario you want them to work through."
                      className="w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-600 focus:bg-white"
                    />
                    <button
                      type="button"
                      disabled={busy || assessmentPrompt.trim().length < 20}
                      onClick={async () => {
                        const sent = await run(() =>
                          assignJoinAssessment(application.id, { title: assessmentTitle, prompt: assessmentPrompt.trim() }),
                        );
                        if (sent) setAssessmentPrompt("");
                      }}
                      className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-black text-white disabled:opacity-40"
                    >
                      Send assessment
                    </button>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          {!loading && detail && tab === "review" ? (
            <div className="space-y-5">
              <section className="rounded-lg border border-zinc-200 p-4">
                <h3 className="text-sm font-black text-zinc-950">Your review</h3>
                <p className="mt-1 text-xs font-semibold leading-5 text-zinc-500">
                  Rate each area from 0 to 5. The weighted total is a prompt for discussion, not a decision.
                </p>
                <div className="mt-3 space-y-3">
                  {areas.map((area) => (
                    <label key={area.key} className="block">
                      <span className="flex items-center justify-between text-xs font-black text-zinc-700">
                        {area.label}
                        <span className="text-zinc-400">{area.weight}% · {ratings[area.key] ?? "–"}</span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={5}
                        step={1}
                        value={ratings[area.key] ?? 0}
                        onChange={(event) => setRatings((current) => ({ ...current, [area.key]: Number(event.target.value) }))}
                        className="mt-1.5 w-full accent-emerald-700"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-4 text-sm font-black text-zinc-950">
                  Application strength: {suggestedScore === null ? "not rated" : `${suggestedScore}/100`}
                </p>

                <label className="mt-3 block">
                  <span className="text-[11px] font-black uppercase tracking-wide text-zinc-500">Recommendation</span>
                  <select
                    value={recommendation}
                    onChange={(event) => setRecommendation(event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm font-black outline-none focus:border-emerald-600 focus:bg-white"
                  >
                    <option value="undecided">Undecided</option>
                    <option value="advance">Advance</option>
                    <option value="hold">Hold</option>
                    <option value="decline">Decline</option>
                  </select>
                </label>
                <textarea
                  rows={2}
                  value={strengths}
                  onChange={(event) => setStrengths(event.target.value)}
                  placeholder="Strengths"
                  className="mt-2 w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-600 focus:bg-white"
                />
                <textarea
                  rows={2}
                  value={concerns}
                  onChange={(event) => setConcerns(event.target.value)}
                  placeholder="What to check"
                  className="mt-2 w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-600 focus:bg-white"
                />
                <button
                  type="button"
                  disabled={busy || !canManage}
                  onClick={() =>
                    run(async () => {
                      await saveJoinReview(application.id, { rating: null, recommendation, strengths, concerns, scores: ratings });
                      return scoreJoinApplication(application.id, suggestedScore, ratings);
                    })
                  }
                  className="mt-3 h-10 w-full rounded-md bg-emerald-700 text-sm font-black text-white disabled:opacity-40"
                >
                  Save review
                </button>
              </section>

              {detail.reviews.length ? (
                <section>
                  <h3 className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Reviews on file</h3>
                  <ul className="mt-2 space-y-2">
                    {detail.reviews.map((review) => (
                      <li key={review.id} className="rounded-lg border border-zinc-200 p-3">
                        <p className="text-sm font-black text-zinc-950">{titleCase(review.recommendation)}</p>
                        {review.strengths ? <p className="mt-1 text-sm font-semibold text-zinc-700">Strengths: {review.strengths}</p> : null}
                        {review.concerns ? <p className="mt-1 text-sm font-semibold text-zinc-700">Check: {review.concerns}</p> : null}
                        <p className="mt-1 text-[11px] font-bold text-zinc-400">{formatDateTime(review.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="rounded-lg border border-zinc-200 p-4">
                <h3 className="text-sm font-black text-zinc-950">Internal notes</h3>
                <p className="mt-1 text-xs font-semibold text-zinc-500">Never shown to the applicant.</p>
                {canManage ? (
                  <>
                    <textarea
                      rows={3}
                      value={noteBody}
                      onChange={(event) => setNoteBody(event.target.value)}
                      className="mt-3 w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-600 focus:bg-white"
                    />
                    <button
                      type="button"
                      disabled={busy || !noteBody.trim()}
                      onClick={async () => {
                        const saved = await run(() => addJoinAdminNote(application.id, noteBody.trim()));
                        if (saved) setNoteBody("");
                      }}
                      className="mt-2 h-10 rounded-md bg-zinc-950 px-4 text-sm font-black text-white disabled:opacity-40"
                    >
                      Add note
                    </button>
                  </>
                ) : null}
                {detail.notes.length ? (
                  <ul className="mt-3 space-y-2">
                    {detail.notes.map((note) => (
                      <li key={note.id} className="rounded-md bg-zinc-50 p-3">
                        <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-800">{note.body}</p>
                        <p className="mt-1 text-[11px] font-bold text-zinc-400">{formatDateTime(note.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section>
                <h3 className="text-[11px] font-black uppercase tracking-wide text-emerald-700">History</h3>
                <ul className="mt-2 space-y-1.5">
                  {[...detail.statusHistory].reverse().map((event) => (
                    <li key={event.id} className="text-xs font-bold leading-5 text-zinc-500">
                      {formatDateTime(event.created_at)} — {titleCase(event.to_status)} ({event.actor_role})
                      {event.reason ? `: ${event.reason}` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
        </div>

        {canManage ? (
          <footer className="border-t border-zinc-200 bg-zinc-50 p-4">
            <div className="flex gap-2">
              <select
                value={statusChoice}
                onChange={(event) => setStatusChoice(event.target.value)}
                className="h-10 flex-1 rounded-md border border-zinc-200 bg-white px-3 text-sm font-black outline-none focus:border-emerald-600"
              >
                {JOIN_STATUSES.map((status) => (
                  <option key={status} value={status} disabled={["accepted", "rejected"].includes(status) && !canDecide}>
                    {titleCase(status)}
                  </option>
                ))}
              </select>
              <select
                value={application.priority}
                onChange={(event) => run(() => setJoinApplicationPriority(application.id, event.target.value))}
                className="h-10 w-32 rounded-md border border-zinc-200 bg-white px-3 text-sm font-black outline-none focus:border-emerald-600"
              >
                {["low", "normal", "high", "urgent"].map((priority) => (
                  <option key={priority} value={priority}>{titleCase(priority)}</option>
                ))}
              </select>
            </div>
            <input
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
              placeholder={decisionStatus ? "Reason shown to the applicant (required)" : "Optional note shown to the applicant"}
              className="mt-2 h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-600"
            />
            <button
              type="button"
              disabled={busy || statusChoice === application.status || (decisionStatus && statusReason.trim().length < 5)}
              onClick={async () => {
                const updated = await run(() => setJoinApplicationStatus(application.id, statusChoice, statusReason.trim()));
                if (updated) setStatusReason("");
              }}
              className="mt-2 h-11 w-full rounded-md bg-emerald-700 text-sm font-black text-white disabled:opacity-40"
            >
              {busy ? "Working…" : `Move to ${titleCase(statusChoice)}`}
            </button>
          </footer>
        ) : null}
      </section>
    </aside>
  );
}
