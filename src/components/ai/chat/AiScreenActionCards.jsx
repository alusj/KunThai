import { useState } from "react";
import { Check, ClipboardCheck, PenLine, Send } from "lucide-react";

import { useI18n } from "../../../i18n";
import {
  applyAiFormValues,
  canDraftOnScreen,
  putAiReplyInDraft,
  sendAiScreenMessage,
  useAiScreenVersion,
} from "../../../Backend/services/ai/aiScreenContext";
import { uiText as translateUi } from "../../../i18n/index.js";

// KAI — cards for what KAI prepared on the open screen.
//
// A form is filled, or a reply sent, only when the person presses the card's
// button. Each press checks the values against the screen as it is right then.

const MAX_VISIBLE_FIELDS = 12;

function FillFormCard({ action, onDone }) {
  const { t } = useI18n();
  const [state, setState] = useState({ status: "idle", message: "" });
  const fields = Array.isArray(action.fields) ? action.fields : [];
  const skipped = Array.isArray(action.skipped) ? action.skipped : [];
  const done = state.status === "done";

  function fill() {
    const outcome = applyAiFormValues(action.screenId, fields.map((field) => ({ key: field.key, value: field.value })));
    if (outcome.ok) {
      setState({ status: "done", message: t("ai.chat.screen.filled", { count: outcome.filled }) });
      // Close the chat so the person sees the filled form straight away.
      window.setTimeout(() => onDone?.(), 700);
      return;
    }
    setState({
      status: "error",
      message: outcome.reason === "screen-closed" ? t("ai.chat.screen.screenClosed") : t("ai.chat.screen.nothingToFill"),
    });
  }

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-sky-100 bg-sky-50 px-3 py-2">
        <ClipboardCheck size={15} className="flex-none text-sky-700" />
        <p className="min-w-0 truncate text-xs font-black text-sky-900">
          {action.screenTitle
            ? t("ai.chat.screen.fillTitle", { count: fields.length, screen: action.screenTitle })
            : t("ai.chat.screen.fillTitleShort", { count: fields.length })}
        </p>
      </div>
      <dl className="divide-y divide-slate-100 px-3">
        {fields.slice(0, MAX_VISIBLE_FIELDS).map((field) => (
          <div key={field.key} className="flex gap-3 py-1.5 text-xs">
            <dt className="w-2/5 flex-none truncate font-bold text-slate-500">{translateUi(field.label)}</dt>
            <dd className="min-w-0 flex-1 break-words font-semibold text-slate-900">{field.display}</dd>
          </div>
        ))}
        {fields.length > MAX_VISIBLE_FIELDS ? (
          <p className="py-1.5 text-[11px] font-bold text-slate-400">+{fields.length - MAX_VISIBLE_FIELDS}</p>
        ) : null}
      </dl>
      {skipped.length ? (
        <div className="border-t border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
          <p className="font-black">{t("ai.chat.screen.skippedTitle")}</p>
          <ul className="mt-0.5 space-y-0.5">
            {skipped.slice(0, 6).map((item) => (
              <li key={`${item.key}-${item.reason}`}>{translateUi(item.label)}: {translateUi(item.reason)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="border-t border-slate-100 px-3 py-2.5">
        <button
          type="button"
          onClick={fill}
          disabled={done}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black text-white transition ${
            done ? "bg-emerald-600" : "bg-slate-900 hover:bg-slate-800"
          }`}
        >
          {done ? <Check size={15} /> : <ClipboardCheck size={15} />}
          {done ? state.message : t("ai.chat.screen.fillButton")}
        </button>
        {state.status === "error" ? (
          <p role="alert" className="mt-1.5 text-center text-[11px] font-bold text-rose-700">{translateUi(state.message)}</p>
        ) : (
          <p className="mt-1.5 text-center text-[10px] font-semibold text-slate-400">{t("ai.chat.screen.fillHint")}</p>
        )}
      </div>
    </div>
  );
}

function SendMessageCard({ action, onDone }) {
  const { t } = useI18n();
  const [state, setState] = useState({ status: "idle", message: "" });
  // Re-checked when screens register or unregister: the screen under the chat
  // may still be mounting when this card first renders.
  useAiScreenVersion();
  const canDraft = canDraftOnScreen(action.screenId);
  const busy = state.status === "sending";
  const sent = state.status === "sent";

  async function send() {
    setState({ status: "sending", message: "" });
    try {
      const outcome = await sendAiScreenMessage(action.screenId, action.text);
      if (outcome.ok) {
        setState({ status: "sent", message: "" });
        return;
      }
      setState({ status: "error", message: outcome.reason === "screen-closed" ? t("ai.chat.screen.screenClosed") : t("ai.chat.screen.sendFailed") });
    } catch {
      setState({ status: "error", message: t("ai.chat.screen.sendFailed") });
    }
  }

  function editInReplyBox() {
    if (putAiReplyInDraft(action.screenId, action.text)) onDone?.();
    else setState({ status: "error", message: t("ai.chat.screen.screenClosed") });
  }

  return (
    <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t("ai.chat.screen.replyTitle")}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-900">{action.text}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={send}
          disabled={busy || sent}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-black text-white transition disabled:cursor-default ${
            sent ? "bg-emerald-600" : "bg-slate-900 hover:bg-slate-800 disabled:opacity-60"
          }`}
        >
          {sent ? <Check size={13} /> : <Send size={13} />}
          {sent ? t("ai.chat.screen.sent") : busy ? t("ai.chat.screen.sending") : t("ai.chat.screen.sendButton")}
        </button>
        {canDraft && !sent ? (
          <button
            type="button"
            onClick={editInReplyBox}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <PenLine size={13} />
            {t("ai.chat.screen.useInReply")}
          </button>
        ) : null}
      </div>
      {state.status === "error" ? <p role="alert" className="mt-1.5 text-[11px] font-bold text-rose-700">{translateUi(state.message)}</p> : null}
    </div>
  );
}

const SCREEN_ACTION_TYPES = new Set(["fill_form", "send_message"]);

export default function AiScreenActionCards({ actions, onDone }) {
  const { t } = useI18n();
  const list = (Array.isArray(actions) ? actions : []).filter((action) => SCREEN_ACTION_TYPES.has(action?.type));
  if (!list.length) return null;
  const hasReplies = list.some((action) => action.type === "send_message");

  return (
    <div>
      {list.map((action, index) => (
        action.type === "fill_form"
          ? <FillFormCard key={`fill-${index}`} action={action} onDone={onDone} />
          : <SendMessageCard key={`send-${index}-${action.text.slice(0, 20)}`} action={action} onDone={onDone} />
      ))}
      {hasReplies ? <p className="mt-1.5 text-[10px] font-semibold text-slate-400">{t("ai.chat.screen.sendHint")}</p> : null}
    </div>
  );
}
