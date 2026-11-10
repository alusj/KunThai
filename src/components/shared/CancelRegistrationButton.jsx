import { useState } from "react";

import CenteredModal from "./CenteredModal";
import { t } from "../../i18n/index";
import { useI18n } from "../../i18n/index.js";

// "Cancel and start afresh" on a form that can be saved and continued later.
// Asks first; onConfirm deletes the saved progress and restarts the form.
export default function CancelRegistrationButton({ onConfirm, disabled = false, className = "" }) {
  useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={`font-black text-rose-600 hover:text-rose-700 disabled:opacity-50 ${className}`}
      >
        {t("registrationResume.cancel")}
      </button>

      <CenteredModal open={open} onClose={() => setOpen(false)} maxWidth="max-w-md" labelledBy="cancel-registration-title">
        <h2 id="cancel-registration-title" className="text-lg font-black text-slate-950">
          {t("registrationResume.title")}
        </h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t("registrationResume.body")}</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-11 rounded-2xl border border-slate-200 px-3 text-sm font-black text-slate-700"
          >
            {t("registrationResume.keep")}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onConfirm?.();
            }}
            className="h-11 rounded-2xl bg-rose-600 px-3 text-sm font-black text-white hover:bg-rose-700"
          >
            {t("registrationResume.confirm")}
          </button>
        </div>
      </CenteredModal>
    </>
  );
}
