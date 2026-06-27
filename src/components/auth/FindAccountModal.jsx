import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Mail, ShieldCheck, X } from "lucide-react";

import {
  findKunThaiAccount,
  getKunThaiAccountEmailHint,
  sendKunThaiAccountVerificationLink,
} from "../../Backend/services/accountIdentityService";

const VERIFICATION_SENT_MESSAGE =
  "We sent a secure verification link to your email. Open it to continue.";

export default function FindAccountModal({ country, phone, redirectTo, onClose, onTryAnotherNumber }) {
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hintLoading, setHintLoading] = useState(true);
  const [emailHint, setEmailHint] = useState("");
  const [error, setError] = useState("");
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
    let active = true;

    setHintLoading(true);
    getKunThaiAccountEmailHint({ phone, country })
      .then((hint) => {
        if (active) setEmailHint(hint);
      })
      .catch(() => {
        if (active) setEmailHint("");
      })
      .finally(() => {
        if (active) setHintLoading(false);
      });

    return () => {
      active = false;
    };
  }, [country, phone]);

  async function handleLookup(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const match = await findKunThaiAccount({ email, phone, country });

      if (!match) {
        setError("We could not match that email and phone number. Check the details and try again.");
        return;
      }

      setAccount(match);
    } catch (lookupError) {
      setError(lookupError.message || "We could not securely look up this account.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendVerificationLink() {
    setError("");
    setLoading(true);

    try {
      await sendKunThaiAccountVerificationLink(email, redirectTo);
      setSent(true);
    } catch (sendError) {
      setError(sendError.message || "We could not send the verification link.");
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    if (sent) {
      setSent(false);
      return;
    }

    if (account) {
      setAccount(null);
      setError("");
      window.setTimeout(() => emailRef.current?.focus(), 0);
      return;
    }

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="find-account-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            Back
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account recovery"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="p-5 sm:p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            {sent ? <Mail size={24} aria-hidden="true" /> : <ShieldCheck size={24} aria-hidden="true" />}
          </div>
          <h2 id="find-account-title" className="mt-4 text-2xl font-bold text-slate-950">
            {sent ? "Check your email" : "Find my account"}
          </h2>

          {sent ? (
            <div className="mt-4">
              <p className="text-sm leading-6 text-slate-600">{VERIFICATION_SENT_MESSAGE}</p>
            </div>
          ) : account ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm leading-6 text-slate-600">
                We found a matching account. Only masked details are shown until you verify ownership.
              </p>
              <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 px-4">
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-sm text-slate-500">Name</dt>
                  <dd className="text-right text-sm font-semibold text-slate-900">{account.maskedName}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-sm text-slate-500">Email</dt>
                  <dd className="min-w-0 break-all text-right text-sm font-semibold text-slate-900">{account.maskedEmail}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-sm text-slate-500">Phone</dt>
                  <dd className="text-right text-sm font-semibold text-slate-900">{account.maskedPhone}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <form onSubmit={handleLookup} className="mt-4 space-y-4">
              <p className="text-sm leading-6 text-slate-600">
                Use the hint below, then enter the full email to verify the match.
              </p>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <span className="text-sm font-semibold text-blue-700">Email hint</span>
                <span className="min-w-0 break-all text-right text-sm font-bold text-slate-950" aria-live="polite">
                  {hintLoading ? "Loading..." : emailHint || "Not available"}
                </span>
              </div>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Connected email</span>
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter the full email"
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
                {loading ? "Checking securely..." : "Find my account"}
              </button>
            </form>
          )}

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {error}
            </p>
          ) : null}

          {account && !sent ? (
            <button
              type="button"
              onClick={handleSendVerificationLink}
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Sending link..." : "Send verification link"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onTryAnotherNumber}
            disabled={loading}
            className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Try another number
          </button>
        </div>
      </section>
    </div>
  );
}
