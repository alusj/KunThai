import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LockKeyhole, ShieldCheck, X } from "lucide-react";

import { t } from "../../i18n";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";

// One slim line ("Private" / "Supervised" + a short hint + Read more); the
// full explanation opens in a sheet only when asked for.
const COPY = {
  explore: {
    labelSource: "Private",
    hintKey: "messagingNotice.privateHint",
    eyebrow: "Private Explore messaging",
    title: "Restricted to conversation participants",
    body: "Messages are protected in transit and are not available in the KunThai admin workspace. Only the people in this conversation can open them.",
  },
  urmall: {
    labelKey: "messagingNotice.supervised",
    hintKey: "messagingNotice.supervisedHint",
    eyebrow: "Supervised commerce messaging",
    title: "Built for safer buying and selling",
    body: "Authorized KunThai reviewers may inspect UrMall conversations when needed for safety, fraud prevention, support, or dispute resolution. Every staff access is recorded.",
  },
};

export default function MessagePrivacyNotice({ compact = false, variant = "explore" }) {
  useUiLocale();
  const [open, setOpen] = useState(false);
  const copy = COPY[variant] || COPY.explore;
  const isUrMall = variant === "urmall";
  const Icon = isUrMall ? ShieldCheck : LockKeyhole;
  const label = copy.labelKey ? t(copy.labelKey) : translateUi(copy.labelSource);
  const tone = isUrMall
    ? { row: "border-emerald-200 bg-emerald-50 text-emerald-950", pill: "bg-emerald-600 text-white", link: "text-emerald-800" }
    : { row: "border-sky-200 bg-sky-50 text-sky-950", pill: "bg-sky-700 text-white", link: "text-sky-800" };

  return (
    <>
      <div
        className={`flex min-w-0 items-center gap-2 ${
          compact ? "border-b px-4 py-2" : "rounded-2xl border px-3 py-2.5"
        } ${tone.row}`}
      >
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${tone.pill}`}>
          <Icon size={13} aria-hidden="true" />
          {label}
        </span>
        {/* Phones show just the label and Read more; wider screens add a hint. */}
        <p className="hidden min-w-0 flex-1 truncate text-xs font-semibold opacity-80 sm:block">{t(copy.hintKey)}</p>
        <span className="flex-1 sm:hidden" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`kt-pressable shrink-0 text-xs font-black underline-offset-2 hover:underline ${tone.link}`}
        >
          {t("messagingNotice.readMore")}
        </button>
      </div>
      {open ? <PrivacySheet copy={copy} Icon={Icon} label={label} pillClass={tone.pill} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PrivacySheet({ copy, Icon, label, pillClass, onClose }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={translateUi(copy.eyebrow)}>
      <button type="button" className="absolute inset-0 cursor-default bg-slate-950/45" onClick={onClose} aria-label={translateUi("Close")} />
      <section className="kt-toast-expand-in relative w-full max-w-md rounded-t-[28px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${pillClass}`}>
            <Icon size={14} aria-hidden="true" />
            {label}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="kt-pressable grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-700"
            aria-label={translateUi("Close")}
          >
            <X size={17} />
          </button>
        </div>
        <p className="mt-4 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{translateUi(copy.eyebrow)}</p>
        <h3 className="mt-1 text-lg font-black text-slate-950">{translateUi(copy.title)}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{translateUi(copy.body)}</p>
        <button
          type="button"
          onClick={onClose}
          className="kt-pressable mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white"
        >
          {translateUi("Got it")}
        </button>
      </section>
    </div>,
    document.body,
  );
}
