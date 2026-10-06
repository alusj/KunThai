import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound } from "lucide-react";

import { updateAccountPassword } from "../../Backend/services/authService";
import { clearEmailRecoveryFlag, shouldShowRecoveryPasswordStep } from "../../Backend/services/emailRecoveryService";
import { showToast } from "../../Backend/services/toastService";
import { useI18n } from "../../i18n";

// Shown once after signing in through an email recovery link: a new password
// makes phone number + password sign-in work again without any SMS code.
export default function RecoveryPasswordSheet({ userId }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!userId) return undefined;
    shouldShowRecoveryPasswordStep()
      .then((show) => {
        if (active && show) setOpen(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  if (!open) return null;

  function close() {
    clearEmailRecoveryFlag();
    setOpen(false);
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    if (password.length < 6) {
      setError(t("auth.errNewPasswordLength"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.errPasswordsNoMatch"));
      return;
    }
    setError("");
    setSaving(true);
    const { error: saveError } = await updateAccountPassword(password).catch((caught) => ({ error: caught }));
    setSaving(false);
    if (saveError) {
      setError(t("auth.errPasswordNotSaved"));
      return;
    }
    showToast(t("auth.emailRecovery.passwordSavedToast"), "success");
    close();
  }

  const inputClass =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-950/45 sm:items-center" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-password-title"
        className="kt-toast-expand-in w-full max-w-md rounded-t-[28px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]"
      >
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">
          <KeyRound size={24} aria-hidden="true" />
        </span>
        <h2 id="recovery-password-title" className="mt-4 text-xl font-black text-slate-950">
          {t("auth.emailRecovery.passwordTitle")}
        </h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t("auth.emailRecovery.passwordBody")}</p>

        <form onSubmit={save} className="mt-4 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("auth.enterPassword")}
            autoComplete="new-password"
            aria-label={t("auth.password")}
            className={inputClass}
          />
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder={t("auth.confirmPasswordPlaceholder")}
            autoComplete="new-password"
            aria-label={t("auth.confirmPassword")}
            className={inputClass}
          />
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="kt-pressable h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? t("auth.emailRecovery.passwordSaving") : t("auth.emailRecovery.passwordSave")}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="kt-pressable h-11 w-full rounded-2xl bg-slate-100 text-sm font-black text-slate-700 disabled:opacity-60"
          >
            {t("auth.emailRecovery.passwordLater")}
          </button>
        </form>
      </section>
    </div>,
    document.body,
  );
}
