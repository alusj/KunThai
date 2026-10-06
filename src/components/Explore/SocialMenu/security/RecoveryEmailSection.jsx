import { useCallback, useEffect, useState } from "react";
import { HiOutlineEnvelope } from "react-icons/hi2";

import { EMAIL_ALREADY_LINKED_CODE } from "../../../../Backend/services/accountIdentityService";
import { getRecoveryEmailState, requestRecoveryEmailConfirmation } from "../../../../Backend/services/emailRecoveryService";
import { useI18n } from "../../../../i18n";
import RecoveryEmailNote from "../../../auth/RecoveryEmailNote";

const STATUS_TONE = {
  verified: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-800",
  unconfirmed: "bg-amber-50 text-amber-800",
  none: "bg-slate-100 text-slate-600",
};

function errorKey(error) {
  if (error?.code === EMAIL_ALREADY_LINKED_CODE) return "onboarding.profile.emailTaken";
  if (error?.code === "invalid_email") return "auth.emailRecovery.errInvalidEmail";
  if (error?.code === "rate_limited") return "auth.emailRecovery.errRateLimited";
  return "auth.recoveryEmail.errSave";
}

// Settings → Security: the email used to get back in without the phone.
// Only a confirmed email can receive a recovery link, so the status is shown
// and the confirmation link can be (re)sent from here.
export default function RecoveryEmailSection() {
  const { t } = useI18n();
  const [state, setState] = useState(null);
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const next = await getRecoveryEmailState().catch(() => ({ status: "none", email: "" }));
    setState(next);
    setEmail((current) => current || next.email);
  }, []);

  useEffect(() => {
    refresh();
    // A confirmation link opened in another tab changes the status.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  async function send(event) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await requestRecoveryEmailConfirmation(email);
      setState(next);
      setEditing(false);
      setNotice(next.status === "verified" ? t("auth.recoveryEmail.alreadyVerified") : t("auth.recoveryEmail.linkSent", { email: next.email }));
    } catch (sendError) {
      setError(t(errorKey(sendError)));
    } finally {
      setBusy(false);
    }
  }

  const status = state?.status || "none";
  const showForm = editing || status === "none";

  return (
    <section className="rounded-[24px] border border-sky-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700">
          <HiOutlineEnvelope className="text-2xl" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-black text-slate-950">{t("auth.recoveryEmail.title")}</h3>
              <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">{t("auth.recoveryEmail.description")}</p>
            </div>
            {state ? (
              <span className={`rounded-full px-3 py-1.5 text-xs font-black ${STATUS_TONE[status]}`}>
                {t(`auth.recoveryEmail.status.${status}`)}
              </span>
            ) : null}
          </div>

          {state && state.email && !showForm ? (
            <p className="mt-3 break-all rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">{state.email}</p>
          ) : null}

          {showForm ? (
            <form onSubmit={send} className="mt-3 space-y-2">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("onboarding.profile.emailPlaceholder")}
                autoComplete="email"
                aria-label={t("onboarding.profile.email")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400"
              />
              <RecoveryEmailNote />
            </form>
          ) : null}

          {notice ? <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{notice}</p> : null}
          {error ? <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">{error}</p> : null}

          {state ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {showForm ? (
                <button type="button" onClick={send} disabled={busy || !email.trim()} className="rounded-2xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
                  {busy ? t("auth.emailRecovery.sending") : t("auth.recoveryEmail.sendConfirm")}
                </button>
              ) : null}
              {!showForm && status !== "verified" ? (
                <button type="button" onClick={send} disabled={busy} className="rounded-2xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
                  {busy ? t("auth.emailRecovery.sending") : t("auth.recoveryEmail.resendConfirm")}
                </button>
              ) : null}
              {!showForm ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setNotice("");
                    setError("");
                  }}
                  disabled={busy}
                  className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-60"
                >
                  {t("auth.recoveryEmail.change")}
                </button>
              ) : status !== "none" ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setEmail(state.email);
                    setError("");
                  }}
                  disabled={busy}
                  className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-60"
                >
                  {t("auth.recoveryEmail.cancel")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
