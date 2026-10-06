import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LifeBuoy, X } from "lucide-react";

import { useI18n } from "../../i18n";

// Inline "For account recovery · Read more" under an email field. The full
// explanation opens in a sheet only when asked for.
export default function RecoveryEmailNote({ className = "" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <span className={`mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500 ${className}`}>
        <LifeBuoy size={13} className="shrink-0 text-sky-700" aria-hidden="true" />
        <span className="min-w-0">{t("auth.recoveryEmail.inline")}</span>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
          className="kt-pressable shrink-0 font-black text-sky-700 underline-offset-2 hover:underline"
        >
          {t("auth.recoveryEmail.readMore")}
        </button>
      </span>
      {open ? <RecoveryEmailSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function RecoveryEmailSheet({ onClose }) {
  const { t } = useI18n();

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="recovery-email-title">
      <button type="button" className="absolute inset-0 cursor-default bg-slate-950/45" onClick={onClose} aria-label={t("auth.emailRecovery.close")} />
      <section className="kt-toast-expand-in relative w-full max-w-md rounded-t-[28px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-700 px-3 py-1.5 text-xs font-black text-white">
            <LifeBuoy size={14} aria-hidden="true" />
            {t("auth.recoveryEmail.inline")}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="kt-pressable grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-700"
            aria-label={t("auth.emailRecovery.close")}
          >
            <X size={17} />
          </button>
        </div>
        <h3 id="recovery-email-title" className="mt-4 text-lg font-black text-slate-950">{t("auth.recoveryEmail.sheetTitle")}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t("auth.recoveryEmail.sheetBody")}</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t("auth.recoveryEmail.sheetConfirm")}</p>
        <button
          type="button"
          onClick={onClose}
          className="kt-pressable mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white"
        >
          {t("auth.recoveryEmail.gotIt")}
        </button>
      </section>
    </div>,
    document.body,
  );
}
