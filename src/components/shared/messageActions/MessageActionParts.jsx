import { HiOutlineArrowUturnLeft, HiOutlineNoSymbol, HiOutlinePencilSquare, HiOutlineXMark } from "react-icons/hi2";

import CenteredModal from "../CenteredModal";
import { t as i18nText } from "../../../i18n/index";
import { useI18n as useUiLocale } from "../../../i18n/index.js";
import { quoteText } from "./messageActionModel.js";
import { quoteLabels } from "./messageActionDom.js";

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
