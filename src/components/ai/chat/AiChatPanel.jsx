import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  CornerDownLeft,
  MessageSquarePlus,
  Minus,
  Plus,
  RefreshCw,
  Scale,
  Send,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

import { useI18n } from "../../../i18n";
import { aiSurfaceLabel } from "../../../Backend/services/ai/aiSurfaceService";
import { snapshotAiScreen, useAiScreenVersion } from "../../../Backend/services/ai/aiScreenContext";
import {
  clearAssistantConversation,
  rateAssistantReply,
  regenerateAssistantReply,
  sendAssistantMessage,
  stopAssistantReply,
  useAssistantConversation,
} from "../../../Backend/services/ai/assistantConversationStore";
import { assistantProgressLabel, assistantPromptsFor, assistantRoleLabel } from "../../../Backend/services/ai/assistantPrompts";
import { runAssistantAction } from "../../../Backend/services/ai/assistantActions";
import useBodyScrollLock from "../../shared/useBodyScrollLock";
import AiEntityCards from "./AiEntityCards";
import AiChatActionButtons from "./AiChatActionButtons";
import AiScreenActionCards from "./AiScreenActionCards";

// KAI — the conversational assistant.
//
// Opened from the floating KAI button or from a screen that wants a
// conversation (UrMall search, UrRide, seller tools, admin). It always knows
// the section and role it was opened for, suggests prompts that fit, and shows
// real KunThai records under each answer. Nothing it shows is actioned without
// the person pressing a button.

// The panel opens at 75% of the screen height; "-" and "+" step between these.
const HEIGHT_STEPS = [25, 50, 75];
const DEFAULT_HEIGHT = 75;

function IconButton({ onClick, label, children, disabled = false, active = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid h-7 w-7 place-items-center rounded-full border transition disabled:opacity-40 ${
        active || "border-slate-200 bg-white text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

export default function AiChatPanel({ open, request, onClose }) {
  const { t } = useI18n();
  const conversation = useAssistantConversation();
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState([]);
  const [copiedId, setCopiedId] = useState("");
  // The panel opens at 75% of the screen. "-" steps it down (75 -> 50 -> 25)
  // and "+" steps it back up; the conversation stays visible at every size and
  // the panel grows or shrinks into the new height.
  const [heightStep, setHeightStep] = useState(HEIGHT_STEPS.indexOf(DEFAULT_HEIGHT));
  const heightPercent = HEIGHT_STEPS[heightStep];
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const autoSentRef = useRef("");

  const surface = request?.surface || "global";
  const role = request?.role || "";
  const canInsert = typeof request?.onInsert === "function";
  // Prompts that fit the screen under the chat come first (fill this form,
  // suggest a reply), then the section's usual prompts.
  const screenVersion = useAiScreenVersion();
  const prompts = useMemo(() => {
    const capabilities = (open ? snapshotAiScreen()?.capabilities : null) || [];
    const screenPrompts = [
      capabilities.includes("form") ? t("ai.chat.screen.promptFill") : "",
      capabilities.includes("message") ? t("ai.chat.screen.promptReply") : "",
      capabilities.length ? t("ai.chat.screen.promptHelp") : "",
    ].filter(Boolean);
    return [...screenPrompts, ...assistantPromptsFor(surface, role)].slice(0, 6);
    // screenVersion re-runs this when the screen underneath changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, role, open, screenVersion, t]);
  const roleLabel = assistantRoleLabel(role);

  useBodyScrollLock(open);

  // Every new conversation opens at the default height.
  useEffect(() => {
    if (open) setHeightStep(HEIGHT_STEPS.indexOf(DEFAULT_HEIGHT));
  }, [open, request?.key]);

  function send(text, extra = {}) {
    sendAssistantMessage({
      text,
      surface,
      role,
      screen: request?.screen || "",
      facts: request?.facts || null,
      ...extra,
    });
    setDraft("");
    setSelection([]);
  }

  // A screen can open the assistant with a message ready to go
  // ("Find similar products", a natural-language UrMall search).
  useEffect(() => {
    if (!open || !request?.message) return;
    const key = `${request.key || ""}:${request.message}`;
    if (autoSentRef.current === key) return;
    autoSentRef.current = key;
    if (request.autoSend) {
      send(request.message, { selection: request.selection || [] });
    } else {
      setDraft(request.message);
    }
    // send closes over the current request by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request?.key, request?.message]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation.messages.length, conversation.busy]);

  function toggleSelect(id) {
    setSelection((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(-3)));
  }

  async function copy(message) {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(""), 1500);
    } catch {
      // The text stays selectable when clipboard access is refused.
    }
  }

  function insert(message) {
    request?.onInsert?.(message.text, { task: "assistant.chat", kind: "text" });
    onClose?.();
  }

  if (typeof document === "undefined") return null;

  const empty = !conversation.messages.length;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="kt-ai-chat"
          className="fixed inset-0 z-[2147483050] flex items-end justify-end bg-slate-950/40 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={onClose}
          role="presentation"
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={t("ai.chat.title")}
            style={{ height: `${heightPercent}dvh` }}
            className="flex w-full flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-2xl transition-[height] duration-300 ease-out motion-reduce:transition-none sm:max-w-md sm:rounded-l-3xl sm:rounded-tr-none"
            initial={{ y: 60, opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <motion.header
              className="flex items-center gap-2.5 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 px-4 py-3 text-white"
            >
              <span className="grid h-9 w-9 flex-none place-items-center rounded-2xl border border-white/20 bg-white/10">
                <Sparkles size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-black">{request?.title || t("ai.chat.title")}</h2>
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
                  {aiSurfaceLabel(surface)}
                  {roleLabel ? ` · ${roleLabel}` : ""}
                </p>
              </div>
              {!empty ? (
                <button
                  type="button"
                  onClick={() => {
                    clearAssistantConversation();
                    setSelection([]);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-black transition hover:bg-white/20"
                >
                  <MessageSquarePlus size={13} />
                  {t("ai.chat.newChat")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setHeightStep((current) => Math.max(0, current - 1));
                }}
                disabled={heightStep === 0}
                aria-label={t("ai.chat.minimize", { percent: HEIGHT_STEPS[Math.max(0, heightStep - 1)] })}
                title={t("ai.chat.minimize", { percent: HEIGHT_STEPS[Math.max(0, heightStep - 1)] })}
                className="rounded-full border border-white/20 bg-white/10 p-1.5 transition hover:bg-white/20 disabled:opacity-30"
              >
                <Minus size={16} />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setHeightStep((current) => Math.min(HEIGHT_STEPS.length - 1, current + 1));
                }}
                disabled={heightStep === HEIGHT_STEPS.length - 1}
                aria-label={t("ai.chat.maximize", { percent: HEIGHT_STEPS[Math.min(HEIGHT_STEPS.length - 1, heightStep + 1)] })}
                title={t("ai.chat.maximize", { percent: HEIGHT_STEPS[Math.min(HEIGHT_STEPS.length - 1, heightStep + 1)] })}
                className="rounded-full border border-white/20 bg-white/10 p-1.5 transition hover:bg-white/20 disabled:opacity-30"
              >
                <Plus size={16} />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose?.();
                }}
                aria-label={t("ai.close")}
                className="rounded-full border border-white/20 bg-white/10 p-1.5 transition hover:bg-white/20"
              >
                <X size={16} />
              </button>
            </motion.header>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4" aria-live="polite">
              {empty ? (
                <div className="space-y-3 px-1">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-black text-slate-900">{t("ai.chat.welcomeTitle")}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{t("ai.chat.welcomeBody")}</p>
                  </div>
                  <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{t("ai.tryAsking")}</p>
                  {prompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      className="flex w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50"
                    >
                      {prompt}
                      <ArrowRight size={14} className="flex-none text-slate-400" />
                    </button>
                  ))}
                </div>
              ) : null}

              {conversation.messages.map((message) =>
                message.author === "user" ? (
                  <div key={message.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2 text-sm leading-relaxed text-white">
                      {message.text}
                    </p>
                  </div>
                ) : (
                  <div key={message.id} className="max-w-[94%]">
                    {message.status === "loading" ? (
                      <div className="flex items-center justify-between gap-3 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3">
                        <span className="flex items-center gap-2 text-xs font-bold text-slate-500">
                          <motion.span
                            className="h-2 w-2 rounded-full bg-sky-500"
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1, repeat: Infinity }}
                          />
                          {assistantProgressLabel(conversation.progress)}
                        </span>
                        <button
                          type="button"
                          onClick={stopAssistantReply}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-black text-slate-600"
                        >
                          <Square size={10} />
                          {t("ai.stop")}
                        </button>
                      </div>
                    ) : null}

                    {message.status === "stopped" ? (
                      <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-500">
                        {t("ai.chat.stopped")}
                        <IconButton onClick={() => regenerateAssistantReply(message.id)} label={t("ai.retry")} disabled={conversation.busy}>
                          <RefreshCw size={12} />
                        </IconButton>
                      </div>
                    ) : null}

                    {message.status === "error" ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3" role="alert">
                        <p className="flex items-start gap-2 text-sm font-bold text-rose-900">
                          <AlertTriangle size={15} className="mt-0.5 flex-none text-rose-600" />
                          {message.error?.message}
                        </p>
                        {message.error?.retryable ? (
                          <button
                            type="button"
                            onClick={() => regenerateAssistantReply(message.id)}
                            disabled={conversation.busy}
                            className="mt-2 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-black text-rose-700 disabled:opacity-50"
                          >
                            <RefreshCw size={12} />
                            {t("ai.retry")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {message.status === "done" ? (
                      <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{message.text}</p>
                        <AiEntityCards
                          entities={message.entities}
                          selection={selection}
                          onToggleSelect={toggleSelect}
                          onOpened={onClose}
                        />
                        <AiScreenActionCards actions={message.actions} onDone={onClose} />
                        <AiChatActionButtons actions={message.actions} onRun={(action) => runAssistantAction(action, { onDone: onClose })} />
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                          {canInsert ? (
                            <button
                              type="button"
                              onClick={() => insert(message)}
                              className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-black text-white"
                            >
                              <CornerDownLeft size={11} />
                              {request?.insertLabel || t("ai.useThis")}
                            </button>
                          ) : null}
                          <IconButton onClick={() => copy(message)} label={t("ai.copy")}>
                            {copiedId === message.id ? <Check size={12} /> : <Copy size={12} />}
                          </IconButton>
                          <IconButton onClick={() => regenerateAssistantReply(message.id)} label={t("ai.regenerate")} disabled={conversation.busy}>
                            <RefreshCw size={12} />
                          </IconButton>
                          <span className="ml-auto flex gap-1">
                            <IconButton
                              onClick={() => rateAssistantReply(message.id, "up")}
                              label={t("ai.helpful")}
                              active={message.feedback === "up" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : ""}
                            >
                              <ThumbsUp size={12} />
                            </IconButton>
                            <IconButton
                              onClick={() => rateAssistantReply(message.id, "down")}
                              label={t("ai.notHelpful")}
                              active={message.feedback === "down" ? "border-rose-300 bg-rose-50 text-rose-700" : ""}
                            >
                              <ThumbsDown size={12} />
                            </IconButton>
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ),
              )}
            </div>

            {selection.length >= 2 ? (
              <div className="border-t border-sky-100 bg-sky-50 px-3 py-2">
                <button
                  type="button"
                  disabled={conversation.busy}
                  onClick={() => send(t("ai.chat.compareMessage"), { selection })}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-3 py-2.5 text-sm font-black text-white disabled:opacity-50"
                >
                  <Scale size={15} />
                  {t("ai.chat.compareSelected", { count: selection.length })}
                </button>
              </div>
            ) : null}

            <footer className="border-t border-slate-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
              {!empty && !conversation.busy ? (
                <div className="-mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={t("ai.chat.quickActions")}>
                  {prompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      className="flex-none rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:border-sky-300 hover:bg-sky-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  send(draft);
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, 1_500))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send(draft);
                    }
                  }}
                  rows={1}
                  placeholder={t("ai.chat.placeholder")}
                  className="max-h-28 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white"
                />
                {conversation.busy ? (
                  <button
                    type="button"
                    onClick={stopAssistantReply}
                    aria-label={t("ai.stop")}
                    className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-slate-200 text-slate-700"
                  >
                    <Square size={15} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    aria-label={t("ai.send")}
                    className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-slate-900 text-white transition disabled:opacity-40"
                  >
                    <Send size={16} />
                  </button>
                )}
              </form>
              <p className="mt-1.5 text-center text-[10px] font-semibold text-slate-400">{t("ai.chat.disclaimer")}</p>
            </footer>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
