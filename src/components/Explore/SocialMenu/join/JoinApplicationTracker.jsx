import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiOutlineChatBubbleLeftRight,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentCheck,
  HiOutlinePaperAirplane,
} from "react-icons/hi2";

import {
  APPLICATION_STATUS_FLOW,
  APPLICATION_STATUS_LABELS,
  APPLICATION_TYPE_LABELS,
  markApplicationRead,
  postApplicationMessage,
  submitAssessmentResponse,
  withdrawApplication,
} from "../../../../Backend/services/explore/joinKunThaiService";
import { showToast } from "../../../../Backend/services/toastService";

import { describeAnswer, visibleQuestions, visibleSections } from "./questionEngine";
import { t as i18nText } from "../../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../i18n/index.js";
import { inlineErrorMessage } from "../../../../Backend/services/friendlyErrorService";

const CLOSED_STATUSES = new Set(["accepted", "rejected", "withdrawn", "archived"]);

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function StatusTimeline({ application, history }) {
  useUiLocale();
  const reached = useMemo(() => {
    const set = new Set(history.map((event) => event.toStatus));
    set.add(application.status);
    return set;
  }, [application.status, history]);

  const currentIndex = APPLICATION_STATUS_FLOW.indexOf(application.status);

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-black text-slate-950">{i18nText("ui.literals.k1b90271d66cf")}</h3>
      {CLOSED_STATUSES.has(application.status) ? (
        <div
          className={`mt-3 rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${
            application.status === "accepted"
              ? "bg-emerald-50 text-emerald-900"
              : application.status === "rejected"
                ? "bg-slate-100 text-slate-700"
                : "bg-amber-50 text-amber-900"
          }`}
        >
          {APPLICATION_STATUS_LABELS[application.status]}
          {application.decisionReason ? ` — ${application.decisionReason}` : ""}
        </div>
      ) : null}

      <ol className="mt-4 space-y-3">
        {APPLICATION_STATUS_FLOW.map((status, index) => {
          const done = reached.has(status) || (currentIndex >= 0 && index < currentIndex);
          const active = status === application.status;
          return (
            <li key={status} className="flex items-start gap-3">
              <span
                className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full text-[11px] font-black ${
                  active ? "bg-sky-700 text-white" : done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                }`}
              >
                {done && !active ? "✓" : index + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-sm font-black ${active ? "text-sky-800" : done ? "text-slate-800" : "text-slate-400"}`}>
                  {APPLICATION_STATUS_LABELS[status]}
                </p>
                {active ? <p className="text-xs font-bold text-slate-500">{i18nText("ui.literals.kfff0b529acac")}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {history.length ? (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{i18nText("ui.literals.k90ccd6497400")}</p>
          <ul className="mt-2 space-y-2">
            {[...history].reverse().map((event) => (
              <li key={event.id} className="text-xs font-bold leading-5 text-slate-500">
                {formatDateTime(event.createdAt)} — {APPLICATION_STATUS_LABELS[event.toStatus] || event.toStatus}
                {event.reason ? `: ${event.reason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function AssessmentCard({ assessment, onSubmitted }) {
  useUiLocale();
  const [response, setResponse] = useState(assessment.response || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = assessment.status === "assigned";

  async function send() {
    setError("");
    setBusy(true);
    try {
      const updated = await submitAssessmentResponse(assessment.id, response);
      onSubmitted(updated);
      showToast(i18nText("ui.literals.kde6eeca25f60"), "success");
    } catch (submitError) {
      setError(inlineErrorMessage(submitError, i18nText("ui.literals.k05cd5e1e9762")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-sky-200 bg-sky-50 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-sky-700 text-white">
          <HiOutlineClipboardDocumentCheck className="text-xl" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-black text-sky-950">{translateUi(assessment.title)}</h3>
          <p className="mt-0.5 text-xs font-bold text-sky-800/70">
            {open ? (assessment.dueAt ? i18nText("ui.literals.k0dfe033fd029", { value0: formatDateTime(assessment.dueAt) }) : i18nText("ui.literals.ke1776f6cd210")) : i18nText("ui.literals.k79b18397dabd", { value0: formatDateTime(assessment.submittedAt) })}
          </p>
        </div>
      </div>
      <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-sky-950">{assessment.prompt}</p>

      {open ? (
        <>
          <textarea
            rows={8}
            value={response}
            onChange={(event) => setResponse(event.target.value)}
            placeholder={i18nText("ui.literals.kc83d1048bb19")}
            className="mt-4 w-full resize-none rounded-2xl bg-white px-4 py-3 text-sm font-bold leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-sky-300"
          />
          {error ? <p role="alert" className="mt-2 text-xs font-bold text-rose-700">{translateUi(error)}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={send}
            className="mt-3 h-12 w-full rounded-2xl bg-sky-700 text-sm font-black text-white disabled:opacity-50"
          >
            {busy ? i18nText("ui.literals.k25bdf9860e96") : i18nText("ui.literals.kbf80bc3169ab")}
          </button>
        </>
      ) : (
        <div className="mt-4 rounded-2xl bg-white p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{i18nText("ui.literals.k3ae5ff6e1731")}</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-800">{assessment.response}</p>
        </div>
      )}
    </section>
  );
}

function MessageThread({ applicationId, messages, onPosted }) {
  useUiLocale();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setError("");
    setBusy(true);
    try {
      const created = await postApplicationMessage(applicationId, text);
      setBody("");
      onPosted(created);
    } catch (postError) {
      setError(inlineErrorMessage(postError, i18nText("ui.literals.k0fee545361a4")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <HiOutlineChatBubbleLeftRight className="text-xl text-sky-700" />
        <h3 className="text-base font-black text-slate-950">{i18nText("ui.literals.k7ea8d8eb583d")}</h3>
      </div>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
        {i18nText("ui.literals.kc1716b68ce5f")}
      </p>

      <div className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
        {messages.length ? (
          messages.map((message) => {
            const mine = message.senderRole === "applicant";
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    mine ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm font-semibold leading-6">{message.body}</p>
                  <p className={`mt-1 text-[10px] font-bold ${mine ? "text-sky-100" : "text-slate-400"}`}>
                    {mine ? i18nText("ui.literals.k905cb326c779") : "KunThai"} · {formatDateTime(message.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm font-bold text-slate-400">
            {i18nText("ui.literals.k048dda89e153")}
          </p>
        )}
        <div ref={endRef} />
      </div>

      {error ? <p role="alert" className="mt-3 text-xs font-bold text-rose-700">{translateUi(error)}</p> : null}
      <div className="mt-4 flex items-end gap-2">
        <textarea
          rows={2}
          maxLength={4000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={i18nText("ui.literals.k46bfc6e80d6d")}
          className="w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
        />
        <button
          type="button"
          disabled={busy || !body.trim()}
          onClick={send}
          className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-700 text-white disabled:opacity-40"
          aria-label={i18nText("ui.literals.kc70a890d1411")}
        >
          <HiOutlinePaperAirplane className="text-lg" />
        </button>
      </div>
    </section>
  );
}

function SubmittedAnswers({ answers, catalogue }) {
  useUiLocale();
  const [open, setOpen] = useState(false);
  const sections = visibleSections(catalogue.sections, answers);

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <h3 className="text-base font-black text-slate-950">{i18nText("ui.literals.ke79fe0343d1d")}</h3>
          <p className="mt-0.5 text-sm font-semibold text-slate-500">{i18nText("ui.literals.kcf92c5b6032e")}</p>
        </div>
        <span className="text-xs font-black text-sky-700">{open ? i18nText("ui.literals.k34d8b60fe253") : i18nText("ui.literals.kd97d1ee339e4")}</span>
      </button>

      {open ? (
        <div className="mt-4 space-y-5">
          {sections.map((section) => (
            <div key={section.key}>
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-sky-700">{translateUi(section.title)}</p>
              <dl className="mt-2 space-y-2.5">
                {visibleQuestions(section, answers)
                  .filter((question) => question.inputType !== "statement")
                  .map((question) => {
                    const described = describeAnswer(question, answers[question.questionKey]);
                    if (!described) return null;
                    return (
                      <div key={question.questionKey}>
                        <dt className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">{translateUi(question.label)}</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-800">{described}</dd>
                      </div>
                    );
                  })}
              </dl>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function JoinApplicationTracker({ catalogue, detail, onBack, onDetailChange }) {
  useUiLocale();
  const application = detail.application;
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState("");
  const markedRef = useRef("");

  useEffect(() => {
    if (markedRef.current === application.id || !application.applicantUnreadCount) return;
    markedRef.current = application.id;
    markApplicationRead(application.id).catch(() => null);
  }, [application.applicantUnreadCount, application.id]);

  const canWithdraw = !CLOSED_STATUSES.has(application.status) && application.status !== "draft";
  const openAssessments = detail.assessments.filter((item) => item.status !== "cancelled");

  async function withdraw() {
    setError("");
    setWithdrawing(true);
    try {
      const updated = await withdrawApplication(application.id, "Withdrawn by the applicant.");
      onDetailChange({ ...detail, application: updated });
      showToast(i18nText("ui.literals.k0f37e851efa2"), "success");
    } catch (withdrawError) {
      setError(inlineErrorMessage(withdrawError, i18nText("ui.literals.k4a4300f2747f")));
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
              {APPLICATION_TYPE_LABELS[application.applicationType]} {i18nText("ui.literals.kd2005cc206cc")}
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">{application.reference || i18nText("ui.literals.k23d33e22acfc")}</h2>
            {application.headline ? <p className="mt-1 text-sm font-bold text-slate-600">{application.headline}</p> : null}
            {application.submittedAt ? (
              <p className="mt-1 text-xs font-bold text-slate-400">{i18nText("ui.literals.k2e00359b9802")} {formatDateTime(application.submittedAt)}</p>
            ) : null}
          </div>
          <button type="button" onClick={onBack} className="flex-none text-xs font-black text-slate-500 hover:text-slate-800">
            {i18nText("ui.literals.kb52b36b7269f")}
          </button>
        </div>

        {application.status === "submitted" ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold leading-6 text-emerald-800">
            <HiOutlineCheckCircle className="mt-0.5 flex-none text-lg" />
            {i18nText("ui.literals.kb1611f1b1233")}
          </div>
        ) : null}
      </section>

      {openAssessments.map((assessment) => (
        <AssessmentCard
          key={assessment.id}
          assessment={assessment}
          onSubmitted={(updated) =>
            onDetailChange({
              ...detail,
              assessments: detail.assessments.map((item) => (item.id === updated.id ? updated : item)),
            })
          }
        />
      ))}

      <StatusTimeline application={application} history={detail.statusHistory} />

      <MessageThread
        applicationId={application.id}
        messages={detail.messages}
        onPosted={(message) => onDetailChange({ ...detail, messages: [...detail.messages, message] })}
      />

      {catalogue ? <SubmittedAnswers answers={detail.answers} catalogue={catalogue} /> : null}

      {error ? <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{translateUi(error)}</p> : null}

      {canWithdraw ? (
        <button
          type="button"
          disabled={withdrawing}
          onClick={withdraw}
          className="h-12 w-full rounded-2xl border border-rose-200 text-sm font-black text-rose-700 disabled:opacity-50"
        >
          {withdrawing ? i18nText("ui.literals.k3dcde338f220") : i18nText("ui.literals.k0a747b87e95a")}
        </button>
      ) : null}
    </div>
  );
}
