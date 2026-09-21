import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  Copy,
  CornerDownLeft,
  Hash,
  RefreshCw,
  Sparkles,
  Square,
  Tag,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

import { useI18n } from "../../i18n";
import { useAiTask } from "../../Backend/hooks/useAiTask";
import {
  AI_TRANSLATE_LANGUAGES,
  actionInsertLabel,
  actionIsReadOnly,
  actionLabel,
  actionNeedsLanguage,
  actionNeedsText,
  defaultActionsForSurface,
  suggestedPrompts,
} from "../../Backend/services/ai/aiActionCatalog";
import { aiSurfaceLabel } from "../../Backend/services/ai/aiSurfaceService";
import useBodyScrollLock from "../shared/useBodyScrollLock";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";

// KAI — the shared assistant sheet.
//
// One component serves every surface. It is opened with a surface, an optional
// piece of text to work on, a list of quick actions, and an optional `onInsert`
// callback. The sheet never writes anywhere itself: a result reaches a KunThai
// field only when the person presses the insert button, and the calling screen
// puts it into a field they can still edit before they post or send anything.
// That keeps "AI never publishes on its own" true by construction.
//
// Result kinds (shaped by the server task):
//   text / json  -> editable text (+ read-only points for summaries)
//   options      -> pick one of several, then edit it
//   tags         -> toggle hashtag chips, insert the selection
//   topic        -> one suggested topic from the list the screen supplied

function SheetButton({ onClick, children, tone = "ghost", disabled = false, title = "" }) {
  useUiLocale();
  const tones = {
    ghost: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    primary: "border-transparent bg-slate-900 text-white hover:bg-slate-800",
    danger: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={translateUi(title)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone] || tones.ghost}`}
    >
      {children}
    </button>
  );
}

function ThinkingLines() {
  useUiLocale();
  return (
    <div className="space-y-2" aria-hidden="true">
      {[100, 92, 70].map((width, index) => (
        <motion.div
          key={width}
          className="h-3 rounded-full bg-slate-200"
          style={{ width: `${width}%` }}
          animate={{ opacity: [0.45, 0.9, 0.45] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: index * 0.12 }}
        />
      ))}
    </div>
  );
}

function resultToText(result) {
  if (!result) return "";
  const points = Array.isArray(result.points) && result.points.length
    ? `\n\n${result.points.map((point) => `• ${point}`).join("\n")}`
    : "";
  return `${result.text || ""}${points}`.trim();
}

export default function AiAssistantSheet({ open, request, onClose }) {
  const { t, locale } = useI18n();
  const surface = request?.surface || "global";
  const screen = request?.screen || "";

  const ai = useAiTask({ surface, screen });
  const [question, setQuestion] = useState("");
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState("");
  const [pendingLanguageTask, setPendingLanguageTask] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState("");
  // What the person is about to insert. Always editable: the model's wording is
  // a starting point, never the final say.
  const [editorText, setEditorText] = useState("");
  const [selectedOption, setSelectedOption] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const scrollRef = useRef(null);
  const startedRef = useRef("");

  useBodyScrollLock(open);

  const sourceText = String(request?.text || "").trim();
  const resultKind = ai.result?.kind || "";
  // Summaries and reviews are for reading; only drafts can go into a field.
  const canInsert = typeof request?.onInsert === "function" && !actionIsReadOnly(ai.task);
  // Keywords behave like hashtags: pick which ones to add.
  const chipKind = resultKind === "tags" || resultKind === "keywords";

  const actions = useMemo(() => {
    const requested = Array.isArray(request?.actions) && request.actions.length ? request.actions : defaultActionsForSurface(surface);
    return requested.filter((task) => (actionNeedsText(task) ? Boolean(sourceText) : true));
  }, [request?.actions, surface, sourceText]);

  const prompts = useMemo(
    () => (Array.isArray(request?.prompts) && request.prompts.length ? request.prompts : suggestedPrompts(surface)),
    [request?.prompts, surface],
  );

  async function start(task, extraInput = {}) {
    setPrepareError("");
    let screenInput = {};
    if (typeof request?.buildInput === "function") {
      // Screens can attach data that is expensive to prepare (a downscaled
      // photo) only when the action that needs it is actually chosen.
      setPreparing(true);
      try {
        screenInput = (await request.buildInput(task)) || {};
      } catch (error) {
        setPrepareError(inlineErrorMessage(error, t("ai.prepareFailed")));
        return;
      } finally {
        setPreparing(false);
      }
    }
    ai.run({ task, input: { text: sourceText, language: locale, ...screenInput, ...(request?.input || {}), ...extraInput } });
  }

  // A caller can ask for a task to run the moment the sheet opens
  // ("Translate" straight from a comment, "Suggest replies" from a reply box).
  useEffect(() => {
    if (!open) {
      startedRef.current = "";
      return;
    }
    const key = `${request?.task || ""}:${sourceText.slice(0, 40)}`;
    if (!request?.task || startedRef.current === key) return;
    startedRef.current = key;
    start(request.task);
    // `start` closes over the current request by design; re-running on it
    // would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request?.task, sourceText]);

  useEffect(() => {
    if (!open) {
      setQuestion("");
      setCopied(false);
      setLanguage("");
      setPendingLanguageTask("");
      setPreparing(false);
      setPrepareError("");
      ai.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Seed the editor whenever a new result lands.
  useEffect(() => {
    const result = ai.result;
    if (!result) {
      setEditorText("");
      setSelectedTags([]);
      setSelectedOption(0);
      return;
    }
    if (result.kind === "options") {
      setSelectedOption(0);
      setEditorText(result.items?.[0] || "");
    } else if (result.kind === "tags" || result.kind === "keywords") {
      setSelectedTags(result.items || []);
    } else {
      setEditorText(resultToText(result));
    }
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [ai.result]);

  function runAction(task, extraInput = {}) {
    if (actionNeedsLanguage(task) && !extraInput.targetLanguage) {
      // Translation needs a destination before it is worth a call.
      setPendingLanguageTask(task);
      return;
    }
    setPendingLanguageTask("");
    start(task, extraInput);
  }

  function askQuestion(text) {
    const value = String(text || question).trim();
    if (!value) return;
    setQuestion("");
    // Screens can route questions to a grounded task (a product question is
    // answered only from that listing) instead of the general assistant.
    const task = request?.askTask || "core.assist";
    const extra = typeof request?.buildAskInput === "function" ? request.buildAskInput(value) || {} : {};
    ai.run({ task, input: { question: value, language: locale, ...extra } });
  }

  function copyableText() {
    if (resultKind === "tags") return selectedTags.map((tag) => `#${tag}`).join(" ");
    if (resultKind === "keywords") return selectedTags.join(", ");
    if (resultKind === "topic") return ai.result?.topic?.name || "";
    if (resultKind === "category") return ai.result?.category || "";
    return editorText.trim();
  }

  async function copyResult() {
    const text = copyableText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission can be refused; the text stays selectable.
    }
  }

  function insertResult() {
    if (!canInsert || !ai.result) return;
    const meta = { task: ai.task, kind: resultKind };
    if (chipKind) {
      if (!selectedTags.length) return;
      request.onInsert(selectedTags, meta);
    } else if (resultKind === "topic") {
      if (!ai.result.topic) return;
      request.onInsert(ai.result.topic, meta);
    } else if (resultKind === "category") {
      if (!ai.result.category) return;
      request.onInsert(ai.result.category, meta);
    } else {
      const text = editorText.trim();
      if (!text) return;
      request.onInsert(text, meta);
    }
    onClose?.();
  }

  function toggleTag(tag) {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  const busy = ai.loading || preparing;
  const insertDisabled =
    chipKind
      ? !selectedTags.length
      : resultKind === "topic"
        ? !ai.result?.topic
        : resultKind === "category"
          ? !ai.result?.category
          : !editorText.trim();
  const insertLabel = request?.insertLabel || actionInsertLabel(ai.task);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="kt-ai-backdrop"
          className="fixed inset-0 z-[2147483100] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="presentation"
          onMouseDown={onClose}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={t("ai.title")}
            className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 330, damping: 30 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 px-4 py-3 text-white">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
                  <Sparkles size={17} />
                </span>
                <div>
                  <h2 className="text-sm font-black leading-tight">{request?.title || t("ai.title")}</h2>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                    {aiSurfaceLabel(surface)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("ai.close")}
                className="rounded-full border border-white/20 bg-white/10 p-1.5 text-white transition hover:bg-white/20"
              >
                <X size={16} />
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              {sourceText ? (
                <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{request?.sourceLabel || t("ai.workingOn")}</p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{sourceText}</p>
                </div>
              ) : null}

              {actions.length ? (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {actions.map((task) => (
                    <button
                      key={task}
                      type="button"
                      onClick={() => runAction(task)}
                      disabled={busy}
                      aria-pressed={ai.task === task && Boolean(ai.result)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                        ai.task === task && (ai.result || busy)
                          ? "border-sky-400 bg-sky-50 text-sky-800"
                          : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
                      }`}
                    >
                      {actionLabel(task)}
                    </button>
                  ))}
                </div>
              ) : null}

              {request?.extraActions?.length ? (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {request.extraActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => {
                        onClose?.();
                        action.run();
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100"
                    >
                      {translateUi(action.label)}
                      <CornerDownLeft size={11} className="rotate-180" />
                    </button>
                  ))}
                </div>
              ) : null}

              {pendingLanguageTask ? (
                <div className="mb-3 rounded-2xl border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs font-bold text-sky-900">{t("ai.chooseLanguage")}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {AI_TRANSLATE_LANGUAGES.map((option) => (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => {
                          setLanguage(option.code);
                          runAction(pendingLanguageTask, { targetLanguage: option.code });
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                          language === option.code
                            ? "border-sky-500 bg-sky-600 text-white"
                            : "border-sky-200 bg-white text-sky-800 hover:bg-sky-100"
                        }`}
                      >
                        {t(option.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {busy ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-500">{preparing ? t("ai.preparing") : t("ai.thinking")}</p>
                    {ai.loading ? (
                      <SheetButton onClick={ai.stop} tone="ghost" title={t("ai.stop")}>
                        <Square size={12} />
                        {t("ai.stop")}
                      </SheetButton>
                    ) : null}
                  </div>
                  <ThinkingLines />
                </div>
              ) : null}

              {(ai.error || prepareError) && !busy ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4" role="alert">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-rose-900">{prepareError || ai.error.message}</p>
                      {ai.error?.retryable && !prepareError ? (
                        <div className="mt-2">
                          <SheetButton onClick={ai.regenerate} tone="danger">
                            <RefreshCw size={12} />
                            {t("ai.retry")}
                          </SheetButton>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {ai.result && !busy ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  {resultKind === "options" ? (
                    <div className="mb-3 space-y-1.5" role="radiogroup" aria-label={t("ai.chooseOption")}>
                      {(ai.result.items || []).map((item, index) => (
                        <button
                          key={item}
                          type="button"
                          role="radio"
                          aria-checked={selectedOption === index}
                          onClick={() => {
                            setSelectedOption(index);
                            setEditorText(item);
                          }}
                          className={`block w-full rounded-2xl border px-3 py-2.5 text-left text-sm leading-relaxed transition ${
                            selectedOption === index
                              ? "border-sky-400 bg-sky-50 font-semibold text-slate-900"
                              : "border-slate-200 bg-white text-slate-700 hover:border-sky-200"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {chipKind ? (
                    <div className="flex flex-wrap gap-1.5">
                      {(ai.result.items || []).map((tag) => {
                        const selected = selectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleTag(tag)}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-black transition ${
                              selected ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-sky-300"
                            }`}
                          >
                            {resultKind === "tags" ? <Hash size={11} /> : null}
                            {tag}
                          </button>
                        );
                      })}
                      {!ai.result.items?.length ? <p className="text-sm text-slate-500">{t("ai.explore.noNewHashtags")}</p> : null}
                    </div>
                  ) : null}

                  {resultKind === "category" && ai.result.category ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-black text-emerald-800">
                      <Tag size={14} />
                      {ai.result.category}
                    </div>
                  ) : null}

                  {resultKind === "topic" && ai.result.topic ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-black text-emerald-800">
                      <Tag size={14} />
                      {ai.result.topic.name}
                    </div>
                  ) : null}

                  {["text", "json", "options"].includes(resultKind) ? (
                    canInsert ? (
                      <label className="block">
                        {resultKind === "options" ? (
                          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{t("ai.editBeforeUsing")}</span>
                        ) : null}
                        <textarea
                          value={editorText}
                          onChange={(event) => setEditorText(event.target.value.slice(0, 4000))}
                          rows={Math.min(8, Math.max(3, Math.ceil(editorText.length / 48)))}
                          className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white"
                        />
                      </label>
                    ) : resultKind !== "options" ? (
                      <>
                        {ai.result.text ? (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{ai.result.text}</p>
                        ) : null}
                        {Array.isArray(ai.result.points) && ai.result.points.length ? (
                          <ul className="mt-2 space-y-1.5">
                            {ai.result.points.map((point) => (
                              <li key={point} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    ) : null
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                    {canInsert ? (
                      <SheetButton onClick={insertResult} tone="primary" disabled={insertDisabled}>
                        <CornerDownLeft size={12} />
                        {insertLabel}
                      </SheetButton>
                    ) : null}
                    <SheetButton onClick={copyResult}>
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? t("ai.copied") : t("ai.copy")}
                    </SheetButton>
                    <SheetButton onClick={ai.regenerate} disabled={!ai.canRegenerate}>
                      <RefreshCw size={12} />
                      {t("ai.regenerate")}
                    </SheetButton>
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => ai.rate("up")}
                        aria-label={t("ai.helpful")}
                        className={`rounded-full border p-1.5 transition ${
                          ai.feedback === "up" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-400 hover:text-slate-700"
                        }`}
                      >
                        <ThumbsUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => ai.rate("down")}
                        aria-label={t("ai.notHelpful")}
                        className={`rounded-full border p-1.5 transition ${
                          ai.feedback === "down" ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-400 hover:text-slate-700"
                        }`}
                      >
                        <ThumbsDown size={12} />
                      </button>
                    </span>
                  </div>
                  {canInsert ? <p className="mt-2 text-[11px] font-semibold text-slate-400">{t("ai.insertNote")}</p> : null}
                </div>
              ) : null}

              {!busy && !ai.result && !ai.error && !prepareError && !sourceText && !request?.hidePrompts ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{t("ai.tryAsking")}</p>
                  {prompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => askQuestion(prompt)}
                      className="block w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <footer className="border-t border-slate-100 bg-slate-50 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              {request?.hideAsk ? null : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    askQuestion();
                  }}
                  className="flex items-end gap-2"
                >
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value.slice(0, 2000))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        askQuestion();
                      }
                    }}
                    rows={1}
                    placeholder={request?.askPlaceholder || t("ai.askPlaceholder")}
                    className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-400"
                  />
                  <button
                    type="submit"
                    disabled={!question.trim() || busy}
                    className="rounded-2xl bg-slate-900 px-3.5 py-2.5 text-white transition hover:bg-slate-800 disabled:opacity-40"
                    aria-label={t("ai.send")}
                  >
                    <Sparkles size={16} />
                  </button>
                </form>
              )}
              <p className={`${request?.hideAsk ? "" : "mt-2"} text-center text-[10px] font-semibold text-slate-400`}>{t("ai.disclaimer")}</p>
            </footer>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
