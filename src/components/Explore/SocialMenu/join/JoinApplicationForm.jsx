import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlinePaperAirplane,
  HiOutlineShieldCheck,
} from "react-icons/hi2";

import {
  acceptApplicationConsent,
  deleteListEntry,
  saveAnswers,
  saveListEntry,
  submitApplication,
} from "../../../../Backend/services/explore/joinKunThaiService";
import { showToast } from "../../../../Backend/services/toastService";

import JoinDocumentsSection from "./JoinDocumentsSection";
import QuestionField from "./QuestionField";
import RepeatableSection from "./JoinListSections";
import { EDUCATION_FIELDS, EXPERIENCE_FIELDS, SKILL_FIELDS } from "./joinListFields";
import { JOIN_PATH_BY_TYPE, noticeFor } from "./joinNotices";
import {
  describeAnswer,
  isQuestionVisible,
  orphanedAnswerKeys,
  sectionProgress,
  validateSection,
  visibleQuestions,
  visibleSections,
} from "./questionEngine";
import { t as i18nText } from "../../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../i18n/index.js";
import { inlineErrorMessage } from "../../../../Backend/services/friendlyErrorService";

// Sections of the catalogue that also carry a list editor, and the ones that
// only exist as a list. Keyed by the section_key stored in the database.
const LIST_FOR_SECTION = {
  education: "education",
  experience: "experience",
  skills: "skills",
  documents: "documents",
};

function ConsentGate({ applicationType, busy, error, onAccept }) {
  useUiLocale();
  const notice = noticeFor(applicationType);
  const [checked, setChecked] = useState({});
  const allAccepted = notice.acknowledgements.every((item) => checked[item.key]);

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-amber-500 text-white">
            <HiOutlineShieldCheck className="text-2xl" />
          </span>
          <div className="min-w-0">
            <h3 className="text-xl font-black text-amber-950">{translateUi(notice.title)}</h3>
            <p className="mt-1.5 text-sm font-semibold leading-6 text-amber-900">{notice.intro}</p>
          </div>
        </div>
        <ul className="mt-5 space-y-2.5">
          {notice.points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-sm font-semibold leading-6 text-amber-950">
              <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-amber-500" />
              {point}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-3">
          {notice.acknowledgements.map((item) => (
            <label key={item.key} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={Boolean(checked[item.key])}
                onChange={(event) => setChecked((current) => ({ ...current, [item.key]: event.target.checked }))}
                className="mt-0.5 h-5 w-5 flex-none rounded border-slate-300 text-sky-700 focus:ring-sky-300"
              />
              <span className="text-sm font-bold leading-6 text-slate-700">{translateUi(item.label)}</span>
            </label>
          ))}
        </div>
        {error ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{translateUi(error)}</p> : null}
        <button
          type="button"
          disabled={!allAccepted || busy}
          onClick={() => onAccept(Object.fromEntries(notice.acknowledgements.map((item) => [item.key, true])))}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-700 text-sm font-black text-white transition hover:bg-sky-800 disabled:opacity-40"
        >
          {busy ? i18nText("ui.literals.k25f14a4beebf") : i18nText("ui.literals.k2e02623966f9")} <HiOutlineArrowRight className="text-lg" />
        </button>
      </section>
    </div>
  );
}

function ReviewStep({ answers, detail, sections }) {
  useUiLocale();
  const shown = visibleSections(sections, answers);
  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-sky-100 bg-sky-50 p-5">
        <h3 className="text-base font-black text-sky-950">{i18nText("ui.literals.k68baf600f69e")}</h3>
        <p className="mt-1 text-sm font-semibold leading-6 text-sky-900/80">
          {i18nText("ui.literals.kc1fab8c9a0f4")}
        </p>
      </section>

      {shown.map((section) => (
        <section key={section.key} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-black text-slate-950">{translateUi(section.title)}</h3>
          <dl className="mt-3 space-y-3">
            {visibleQuestions(section, answers)
              .filter((question) => question.inputType !== "statement")
              .map((question) => {
                const described = describeAnswer(question, answers[question.questionKey]);
                return (
                  <div key={question.questionKey} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                    <dt className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{translateUi(question.label)}</dt>
                    <dd className={`mt-1 whitespace-pre-wrap text-sm font-bold leading-6 ${described ? "text-slate-900" : "text-slate-400"}`}>
                      {described || i18nText("ui.literals.k2fa41b180511")}
                    </dd>
                  </div>
                );
              })}
          </dl>
        </section>
      ))}

      {detail.education.length || detail.experience.length || detail.skills.length || detail.documents.length ? (
        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-black text-slate-950">{i18nText("ui.literals.k2a27abe26f1c")}</h3>
          <ul className="mt-3 space-y-1.5 text-sm font-bold text-slate-600">
            {detail.education.length ? <li>{detail.education.length} {i18nText("ui.literals.k006442b3906c")}{detail.education.length === 1 ? "" : "s"}</li> : null}
            {detail.experience.length ? <li>{detail.experience.length} {i18nText("ui.literals.ka8709487a460")}{detail.experience.length === 1 ? "" : "s"}</li> : null}
            {detail.skills.length ? <li>{detail.skills.length} {i18nText("ui.literals.k34b33e00b199")}{detail.skills.length === 1 ? "" : "s"}</li> : null}
            {detail.documents.length ? <li>{detail.documents.length} {i18nText("ui.literals.k4f8278c89ad1")}{detail.documents.length === 1 ? "" : "s"}</li> : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default function JoinApplicationForm({ catalogue, detail, onCancel, onDetailChange, onDiscard, onSubmitted }) {
  const { locale: memoLocale } = useUiLocale();
  const application = detail.application;
  const path = JOIN_PATH_BY_TYPE[application.applicationType];

  const [answers, setAnswers] = useState(detail.answers || {});
  const [errors, setErrors] = useState({});
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const dirtyKeys = useRef(new Set());
  const scrollAnchor = useRef(null);

  const steps = useMemo(() => {
    const list = visibleSections(catalogue.sections, answers).map((section) => ({
      kind: "section",
      key: section.key,
      title: section.title,
      description: section.description,
      section,
      list: LIST_FOR_SECTION[section.key] || "",
    }));
    list.push({ kind: "review", key: "review", title: i18nText("ui.literals.kd30a45fd247a"), description: "" });
    return list;
  }, [answers, catalogue.sections, memoLocale]);

  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[safeIndex];

  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [safeIndex]);

  function setAnswer(questionKey, value) {
    dirtyKeys.current.add(questionKey);
    setAnswers((current) => ({ ...current, [questionKey]: value }));
    setErrors((current) => (current[questionKey] ? { ...current, [questionKey]: "" } : current));
  }

  async function persistAnswers(nextAnswers = answers) {
    if (!dirtyKeys.current.size) return;
    const payload = {};
    for (const key of dirtyKeys.current) {
      payload[key] = nextAnswers[key] ?? null;
    }
    await saveAnswers(application.id, payload);
    dirtyKeys.current.clear();
    onDetailChange({ ...detail, answers: nextAnswers });
  }

  async function goNext() {
    setNotice("");
    if (step.kind === "section") {
      const sectionErrors = validateSection(step.section, answers);
      if (Object.keys(sectionErrors).length) {
        setErrors((current) => ({ ...current, ...sectionErrors }));
        setNotice(i18nText("ui.literals.k60a7729d888d"));
        return;
      }
    }

    setBusy(true);
    try {
      await persistAnswers();
      setStepIndex((current) => Math.min(current + 1, steps.length - 1));
    } catch (saveError) {
      setNotice(inlineErrorMessage(saveError, i18nText("ui.literals.kb8e8c55cd4dd")));
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setNotice("");
    setBusy(true);
    try {
      await persistAnswers();
      showToast("Draft has been saved", "success");
    } catch (saveError) {
      setNotice(inlineErrorMessage(saveError, i18nText("ui.literals.k16cfe680012e")));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setNotice("");
    setBusy(true);
    try {
      // Clear answers to questions that later became hidden, so nothing stale
      // reaches the reviewer.
      const orphans = orphanedAnswerKeys(catalogue.sections, answers);
      const cleaned = { ...answers };
      for (const key of orphans) {
        cleaned[key] = null;
        dirtyKeys.current.add(key);
      }
      setAnswers(cleaned);
      await persistAnswers(cleaned);

      const submitted = await submitApplication(application.id);
      onSubmitted(submitted);
    } catch (submitError) {
      setNotice(inlineErrorMessage(submitError, i18nText("ui.literals.k786912c3fbce")));
    } finally {
      setBusy(false);
    }
  }

  async function saveListItem(kind, entry) {
    const saved = await saveListEntry(kind, application.id, entry);
    const existing = detail[kind] || [];
    const next = entry.id
      ? existing.map((item) => (item.id === saved.id ? saved : item))
      : [...existing, saved];
    onDetailChange({ ...detail, [kind]: next });
  }

  async function removeListItem(kind, entry) {
    await deleteListEntry(kind, entry.id);
    onDetailChange({ ...detail, [kind]: (detail[kind] || []).filter((item) => item.id !== entry.id) });
  }

  if (!application.consentAcceptedAt) {
    return (
      <ConsentGate
        applicationType={application.applicationType}
        busy={busy}
        error={notice}
        onAccept={async (consent) => {
          setNotice("");
          setBusy(true);
          try {
            const updated = await acceptApplicationConsent(application.id, consent);
            onDetailChange({ ...detail, application: updated });
          } catch (consentError) {
            setNotice(inlineErrorMessage(consentError, i18nText("ui.literals.kfbebcdbbedff")));
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  const progress = step.kind === "section" ? sectionProgress(step.section, answers) : null;

  return (
    <div className="space-y-4">
      <div ref={scrollAnchor} />

      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">
            {path?.title || i18nText("ui.literals.kb291beb8793f")} {i18nText("ui.literals.k53b2b2816a36")} {safeIndex + 1} {i18nText("ui.literals.kde04fa0e29f9")} {steps.length}
          </p>
          <div className="flex flex-none items-center gap-3">
            {onDiscard ? (
              <button type="button" onClick={onDiscard} className="text-xs font-black text-rose-600 hover:text-rose-700">
                {i18nText("ui.literals.k3a09ce0de183")}
              </button>
            ) : null}
            <button type="button" onClick={onCancel} className="text-xs font-black text-slate-500 hover:text-slate-800">
              {i18nText("ui.literals.kbbfa773e5a63")}
            </button>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-sky-600 transition-all"
            style={{ width: `${Math.round(((safeIndex + 1) / steps.length) * 100)}%` }}
          />
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-black text-slate-950">{translateUi(step.title)}</h2>
        {step.description ? (
          <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-500">{translateUi(step.description)}</p>
        ) : null}
        {progress?.requiredTotal ? (
          <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
            {progress.requiredAnswered} {i18nText("ui.literals.kde04fa0e29f9")} {progress.requiredTotal} {i18nText("ui.literals.k2d905a59fd07")}
          </p>
        ) : null}

        {step.kind === "section" ? (
          <div className="mt-5 grid gap-5">
            {step.section.questions
              .filter((question) => isQuestionVisible(question, answers))
              .map((question) => (
                <QuestionField
                  key={question.questionKey}
                  question={question}
                  value={answers[question.questionKey]}
                  error={errors[question.questionKey] || ""}
                  onChange={(value) => setAnswer(question.questionKey, value)}
                />
              ))}
          </div>
        ) : null}
      </section>

      {step.list === "education" ? (
        <RepeatableSection
          title={i18nText("ui.literals.k56663729aef0")}
          description={i18nText("ui.literals.k798a07cd684e")}
          addLabel="Add qualification"
          entries={detail.education}
          fields={EDUCATION_FIELDS}
          emptyEntry={{ currentlyStudying: false }}
          onSave={(entry) => saveListItem("education", entry)}
          onRemove={(entry) => removeListItem("education", entry)}
        />
      ) : null}

      {step.list === "experience" ? (
        <RepeatableSection
          title={i18nText("ui.literals.kba566ee17cbc")}
          description={i18nText("ui.literals.kc5d387d91d3b")}
          addLabel="Add role"
          entries={detail.experience}
          fields={EXPERIENCE_FIELDS}
          emptyEntry={{ currentlyHere: false, mayContact: false }}
          onSave={(entry) => saveListItem("experience", entry)}
          onRemove={(entry) => removeListItem("experience", entry)}
        />
      ) : null}

      {step.list === "skills" ? (
        <RepeatableSection
          title={i18nText("ui.literals.ke09212c7d3ea")}
          description={i18nText("ui.literals.ke8765c838443")}
          addLabel="Add skill"
          entries={detail.skills}
          fields={SKILL_FIELDS}
          emptyEntry={{ proficiency: "intermediate" }}
          onSave={(entry) => saveListItem("skills", entry)}
          onRemove={(entry) => removeListItem("skills", entry)}
        />
      ) : null}

      {step.list === "documents" ? (
        <JoinDocumentsSection
          applicationId={application.id}
          documents={detail.documents}
          onChange={(documents) => onDetailChange({ ...detail, documents })}
        />
      ) : null}

      {step.kind === "review" ? <ReviewStep answers={answers} detail={translateUi(detail)} sections={catalogue.sections} /> : null}

      {notice ? (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-700">
          <HiOutlineExclamationTriangle className="mt-0.5 flex-none text-lg" /> {translateUi(notice)}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[24px] sm:border sm:px-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safeIndex === 0 || busy}
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-slate-100 text-slate-700 disabled:opacity-40"
            aria-label={i18nText("ui.literals.kda57050ad0b6")}
          >
            <HiOutlineArrowLeft className="text-lg" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={saveDraft}
            className="h-12 flex-none rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700 disabled:opacity-40"
          >
            {i18nText("ui.literals.k4f25637a5b7e")}
          </button>
          {step.kind === "review" ? (
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-sky-700 text-sm font-black text-white transition hover:bg-sky-800 disabled:opacity-50"
            >
              <HiOutlinePaperAirplane className="text-lg" /> {busy ? i18nText("ui.literals.k25bdf9860e96") : i18nText("ui.literals.k93ff9f7165f3")}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={goNext}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white disabled:opacity-50"
            >
              {busy ? i18nText("ui.literals.k56a2285c5b11") : i18nText("ui.literals.k2e02623966f9")} <HiOutlineArrowRight className="text-lg" />
            </button>
          )}
        </div>
        {progress?.complete && step.kind === "section" ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
            <HiOutlineCheckCircle className="text-base" /> {i18nText("ui.literals.ka95bcd19f559")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
