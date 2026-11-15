import { useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck } from "lucide-react";

import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";
import { t } from "../../i18n/index";
import { useI18n } from "../../i18n/index.js";

// Shown on a store or fleet profile card once every detail and every main
// document has been submitted (the optional extras never count), even while
// KunThai's review is still running. Tapping it says what that means.
//
// It is pinned to the top edge of its card (the card is `relative` and does
// not clip), so it shares no row with the name or status chips: those stay
// exactly where they are whether or not the card is Trusted.
export default function TrustedTag({ verified = false, className = "absolute -top-3 right-5 z-10" }) {
  useI18n();
  const [open, setOpen] = useState(false);
  useBrowserBack(open, () => setOpen(false), "trusted-tag");

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={`kt-pressable inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-white bg-emerald-600 pl-2 pr-3 text-[11px] font-black uppercase tracking-wide text-white shadow-[0_4px_12px_-4px_rgba(5,150,105,0.55)] ${className}`}
      >
        <ShieldCheck size={14} strokeWidth={2.6} aria-hidden="true" />
        {t("setupStatus.trusted")}
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/60 p-5" onClick={() => setOpen(false)} role="presentation">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="kt-trusted-title"
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-sm rounded-[28px] bg-[var(--kt-app-surface)] p-6 text-center text-[var(--kt-app-text)] shadow-2xl"
              >
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <ShieldCheck size={28} aria-hidden="true" />
                </span>
                <h2 id="kt-trusted-title" className="mt-4 text-xl font-black">{t("setupStatus.trusted")}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--kt-app-text-soft)]">
                  {t(verified ? "setupStatus.trustedVerified" : "setupStatus.trustedSubmitted")}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-5 min-h-12 w-full rounded-2xl bg-emerald-600 text-sm font-black text-white"
                >
                  {t("setupStatus.gotIt")}
                </button>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
