import { useEffect, useState } from "react";
import { HiOutlineArrowUturnLeft, HiOutlineFlag, HiOutlineNoSymbol, HiOutlinePencilSquare, HiOutlineXMark } from "react-icons/hi2";

import CenteredModal from "../CenteredModal";
import { t as i18nText } from "../../../i18n/index";
import { useI18n as useUiLocale } from "../../../i18n/index.js";
import { quoteText } from "./messageActionModel.js";
import { quoteLabels } from "./messageActionDom.js";
import { REPORT_REASONS } from "../../../Backend/services/media/imageActions.js";

// The quoted message at the top of a reply. tone: "dark" on my dark bubble,
// "emerald" on UrMall's green bubble, "light" on theirs.
export function MessageReplyQuote({ snapshot, author, tone = "light", onOpen }) {
  useUiLocale();
  if (!snapshot) return null;
  const toneClass = tone === "dark"
    ? "border-white/60 bg-white/10 text-white/85"
    : tone === "emerald"
      ? "border-white/70 bg-white/15 text-white/90"
      : "border-sky-500 bg-slate-950/[0.04] text-slate-600";
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.();
      }}
      className={`mb-2 block w-full min-w-0 rounded-xl border-l-4 px-3 py-1.5 text-left text-xs ${toneClass}`}
    >
      <span className="block truncate font-black">{author}</span>
      <span className={`block truncate font-semibold ${snapshot.deleted ? "italic" : ""}`}>{quoteText(snapshot, quoteLabels())}</span>
    </button>
  );
}

// "This message was deleted" in place of a bubble's content.
export function DeletedMessageBody({ tone = "light" }) {
  useUiLocale();
  return (
    <p className={`flex items-center gap-1.5 italic ${tone === "light" ? "text-slate-500" : "text-white/75"}`}>
      <HiOutlineNoSymbol className="flex-none" aria-hidden="true" />
      {i18nText("messageActions.deleted")}
    </p>
  );
}

// The bar above a composer while replying to or editing a message.
// context: { mode: "reply" | "edit", author, snapshot }.
export function ComposerContextBar({ context, onCancel, accent = "sky" }) {
  useUiLocale();
  if (!context) return null;
  const editing = context.mode === "edit";
  const Icon = editing ? HiOutlinePencilSquare : HiOutlineArrowUturnLeft;
  const accentClass = accent === "emerald" ? "border-emerald-500 text-emerald-700" : "border-sky-500 text-sky-700";
  const title = editing
    ? i18nText("messageActions.editing")
    : context.author === i18nText("messageActions.you")
      ? i18nText("messageActions.replyingToYourself")
      : i18nText("messageActions.replyingTo", { name: context.author });
  return (
    <div className={`mb-2 flex min-w-0 items-center gap-2 rounded-2xl border-l-4 bg-slate-50 py-1.5 pl-3 pr-1 ${accentClass}`}>
      <Icon className="flex-none text-base" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-black">{title}</p>
        <p className="truncate text-xs font-semibold text-slate-500">{quoteText(context.snapshot || {}, quoteLabels())}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-lg text-slate-500 hover:bg-slate-200"
        aria-label={editing ? i18nText("messageActions.cancelEdit") : i18nText("messageActions.cancelReply")}
      >
        <HiOutlineXMark />
      </button>
    </div>
  );
}

// "Delete for everyone / Delete for me / Cancel" for my own recent message.
export function DeleteMessageDialog({ open, onChoose, onClose }) {
  useUiLocale();
  return (
    <CenteredModal open={open} onClose={onClose} quick maxWidth="max-w-sm" labelledBy="kt-delete-message-title">
      <h2 id="kt-delete-message-title" className="text-lg font-black text-slate-950">{i18nText("messageActions.deleteTitle")}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{i18nText("messageActions.deleteBody")}</p>
      <div className="mt-5 grid gap-2">
        <button
          type="button"
          onClick={() => onChoose?.("everyone")}
          className="h-12 rounded-2xl bg-rose-600 px-4 text-sm font-black text-white active:bg-rose-700"
        >
          {i18nText("messageActions.deleteForEveryone")}
        </button>
        <button
          type="button"
          onClick={() => onChoose?.("me")}
          className="h-12 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-black text-rose-700 active:bg-rose-50"
        >
          {i18nText("messageActions.deleteForMe")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-12 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 active:bg-slate-200"
        >
          {i18nText("messageActions.cancel")}
        </button>
      </div>
    </CenteredModal>
  );
}

const REPORT_REASON_KEYS = {
  nudity: "reasonNudity",
  harassment: "reasonHarassment",
  scam: "reasonScam",
  violence: "reasonViolence",
  spam: "reasonSpam",
  other: "reasonOther",
};

// "Report this": a reason, an optional note, and a line saying the safety team
// will see it. onSubmit({ reason, details }) files it.
export function ReportSheet({ open, onClose, onSubmit }) {
  useUiLocale();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setDetails("");
    setSending(false);
  }, [open]);

  async function submit(event) {
    event.preventDefault();
    if (!reason || sending) return;
    setSending(true);
    try {
      await onSubmit?.({ reason, details });
    } finally {
      setSending(false);
    }
  }

  return (
    <CenteredModal open={open} onClose={onClose} quick maxWidth="max-w-sm" labelledBy="kt-report-title">
      <form onSubmit={submit}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-rose-50 text-lg text-rose-600"><HiOutlineFlag aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 id="kt-report-title" className="text-lg font-black text-slate-950">{i18nText("messageActions.reportTitle")}</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{i18nText("messageActions.reportBody")}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-1.5" role="radiogroup" aria-labelledby="kt-report-title">
          {REPORT_REASONS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={reason === value}
              onClick={() => setReason(value)}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
                reason === value ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-700 active:bg-slate-50"
              }`}
            >
              {i18nText(`messageActions.${REPORT_REASON_KEYS[value]}`)}
              <span className={`h-4 w-4 flex-none rounded-full border-2 ${reason === value ? "border-rose-600 bg-rose-600" : "border-slate-300"}`} aria-hidden="true" />
            </button>
          ))}
        </div>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value.slice(0, 500))}
          placeholder={i18nText("messageActions.reportDetails")}
          rows={2}
          className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-rose-300 focus:bg-white"
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-slate-100 text-sm font-black text-slate-700 active:bg-slate-200">
            {i18nText("messageActions.cancel")}
          </button>
          <button type="submit" disabled={!reason || sending} className="h-12 rounded-2xl bg-rose-600 text-sm font-black text-white active:bg-rose-700 disabled:opacity-50">
            {i18nText("messageActions.sendReport")}
          </button>
        </div>
      </form>
    </CenteredModal>
  );
}
