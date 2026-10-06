import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Mail, MailCheck, X } from "lucide-react";

import { sendEmailRecoveryLink, verifyEmailRecoveryCode } from "../../Backend/services/emailRecoveryService";
import { useI18n } from "../../i18n";

const RESEND_COOLDOWN_SECONDS = 60;

function errorKey(error) {
  if (error?.code === "invalid_email") return "auth.emailRecovery.errInvalidEmail";
  if (error?.code === "rate_limited") return "auth.emailRecovery.errRateLimited";
  if (error?.code === "network") return "auth.emailRecovery.errNetwork";
  if (error?.code === "invalid_code") return "auth.emailRecovery.errInvalidCode";
  return "auth.emailRecovery.errGeneric";
}

// "Can't access your phone?" on Login. Sends a one-time sign-in link to the
// account's confirmed email; App asks for a new password once it signs in.
export default function EmailRecoveryModal({ onClose }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const emailRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendLink(event) {
    event?.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const normalized = await sendEmailRecoveryLink(email);
      setSentTo(normalized);
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (sendError) {
      setError(t(errorKey(sendError)));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    if (loading || code.length < 6) return;
    setError("");
    setLoading(true);
    try {
      // On success the auth listener routes away from Login on its own.
      await verifyEmailRecoveryCode(sentTo, code);
    } catch (verifyError) {
      setError(t(errorKey(verifyError)));
      setLoading(false);
    }
  }

  function changeEmail() {
    setSentTo("");
    setCode("");
    setError("");
    window.setTimeout(() => emailRef.current?.focus(), 0);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-recovery-title"
        className="kt-toast-expand-in max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={sentTo ? changeEmail : onClose}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            {t("auth.back")}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("auth.emailRecovery.close")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="p-5 sm:p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            {sentTo ? <MailCheck size={24} aria-hidden="true" /> : <Mail size={24} aria-hidden="true" />}
          </div>
          <h2 id="email-recovery-title" className="mt-4 text-2xl font-bold text-slate-950">
            {sentTo ? t("auth.emailRecovery.sentTitle") : t("auth.emailRecovery.title")}
          </h2>

          {sentTo ? (
            <div className="mt-3 space-y-4">
              <p className="text-sm leading-6 text-slate-600">{t("auth.emailRecovery.sentBody", { email: sentTo })}</p>
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
                {t("auth.emailRecovery.sentHint")}
              </p>

              <form onSubmit={verifyCode} className="space-y-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">{t("auth.emailRecovery.codeLabel")}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder={t("auth.enterOtp")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading || code.length < 6}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {loading ? t("auth.verifying") : t("auth.emailRecovery.verifyCode")}
                </button>
              </form>

              <button
                type="button"
                onClick={sendLink}
                disabled={loading || cooldown > 0}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {cooldown > 0 ? t("auth.emailRecovery.resendIn", { seconds: cooldown }) : t("auth.emailRecovery.resend")}
              </button>
            </div>
          ) : (
            <form onSubmit={sendLink} className="mt-3 space-y-4">
              <p className="text-sm leading-6 text-slate-600">{t("auth.emailRecovery.body")}</p>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">{t("auth.emailRecovery.emailLabel")}</span>
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("onboarding.profile.emailPlaceholder")}
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? t("auth.emailRecovery.sending") : t("auth.emailRecovery.send")}
              </button>
              <p className="text-xs font-semibold leading-5 text-slate-500">{t("auth.emailRecovery.needsConfirmed")}</p>
            </form>
          )}

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
