import { useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck } from "lucide-react";

import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";
import { t } from "../../i18n/index";
import { useI18n } from "../../i18n/index.js";

// Shown on a store or fleet dashboard once every detail and document has been
// submitted. Tapping it says what that means.
export default function TrustedTag({ verified = false, className = "" }) {
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
        className={`inline-flex min-h-7 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 ${className}`}
      >
        <ShieldCheck size={13} aria-hidden="true" />
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
