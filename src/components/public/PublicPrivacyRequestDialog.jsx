import { useEffect, useId, useState } from "react";
import {
  HiOutlineCheckCircle,
  HiOutlineCircleStack,
  HiOutlineShieldCheck,
  HiOutlineTrash,
  HiOutlineXMark,
} from "react-icons/hi2";

import { submitPublicPrivacyRequest } from "../../Backend/services/publicPrivacyRequestService";
import { legalConfig } from "../../config/legalConfig";

const EMPTY_FORM = {
  fullName: "",
  accountEmail: "",
  accountPhone: "",
  country: "",
  details: "",
  confirmed: false,
  website: "",
};

function RequestField({ children, hint = "", label, required = false }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-800 dark:text-slate-100">
        {label}{required ? <span className="text-rose-600"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

export default function PublicPrivacyRequestDialog({ requestType, onClose }) {
  const titleId = useId();
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const isDeletion = requestType === "account_deletion";

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose?.();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!form.accountEmail.trim() && !form.accountPhone.trim()) {
      setError("Enter the email address or phone number connected to your KunThai account.");
      return;
    }
    if (!form.confirmed) {
      setError("Confirm that you own, or are authorized to act for, this account.");
      return;
    }

    setBusy(true);
    try {
      const result = await submitPublicPrivacyRequest({
        requestType,
        fullName: form.fullName,
        accountEmail: form.accountEmail,
        accountPhone: form.accountPhone,
        country: form.country,
        details: form.details,
        confirmed: form.confirmed,
        website: form.website,
      });
      setReceipt(result);
    } catch (submitError) {
      setError(submitError.message || "KunThai could not submit your request right now.");
    } finally {
      setBusy(false);
    }
  }

  const mailSubject = encodeURIComponent(isDeletion ? "KunThai account deletion request" : "KunThai data access request");
  const mailHref = `mailto:${legalConfig.privacyEmail}?subject=${mailSubject}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 px-4 py-6" role="presentation">
      <button type="button" aria-label="Close request form" onClick={() => !busy && onClose?.()} className="absolute inset-0 cursor-default" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-full w-full max-w-xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-7"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
          aria-label="Close"
        >
          <HiOutlineXMark className="text-xl" />
        </button>

        {receipt ? (
          <div className="py-4 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <HiOutlineCheckCircle className="text-4xl" />
            </span>
            <h2 id={titleId} className="mt-5 text-2xl font-black text-slate-950 dark:text-white">Request received</h2>
            <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              KunThai has recorded your {isDeletion ? "account deletion" : "data access"} request. Keep this reference for follow-up.
            </p>
            <p className="mx-auto mt-4 w-fit rounded-2xl bg-slate-100 px-5 py-3 font-mono text-base font-black tracking-wide text-slate-950 dark:bg-slate-800 dark:text-white">
              {receipt.reference}
            </p>
            <p className="mt-4 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
              We may contact you to verify ownership before releasing data or deleting an account.
            </p>
            <button type="button" onClick={onClose} className="mt-6 h-12 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className={`grid h-14 w-14 place-items-center rounded-2xl ${isDeletion ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"}`}>
              {isDeletion ? <HiOutlineTrash className="text-3xl" /> : <HiOutlineCircleStack className="text-3xl" />}
            </div>
            <h2 id={titleId} className="mt-4 pr-12 text-2xl font-black text-slate-950 dark:text-white">
              {isDeletion ? "Request account deletion" : "Request a copy of your data"}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              {isDeletion
                ? "Submit this form even if you no longer have the app. After ownership checks, eligible account data will be deleted or anonymized, subject to disclosed legal and safety retention."
                : "Tell us which KunThai account is yours. We will verify ownership before preparing or releasing personal data."}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} /></label>
              </div>

              <RequestField label="Full name" required>
                <input
                  required
                  autoComplete="name"
                  value={form.fullName}
                  onChange={(event) => update("fullName", event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-sky-950"
                />
              </RequestField>

              <div className="grid gap-4 sm:grid-cols-2">
                <RequestField label="Account email" hint="Enter this or the account phone number.">
                  <input
                    type="email"
                    autoComplete="email"
                    value={form.accountEmail}
                    onChange={(event) => update("accountEmail", event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-sky-950"
                  />
                </RequestField>
                <RequestField label="Account phone" hint="Include the international country code.">
                  <input
                    type="tel"
                    autoComplete="tel"
                    placeholder="+232…"
                    value={form.accountPhone}
                    onChange={(event) => update("accountPhone", event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-sky-950"
                  />
                </RequestField>
              </div>

              <RequestField label="Country or region">
                <input
                  autoComplete="country-name"
                  value={form.country}
                  onChange={(event) => update("country", event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-sky-950"
                />
              </RequestField>

              <RequestField label={isDeletion ? "Anything we should know?" : "Data or date range requested"} hint="Do not include passwords or one-time codes.">
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={form.details}
                  onChange={(event) => update("details", event.target.value)}
                  className="mt-2 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold leading-6 text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-sky-950"
                />
              </RequestField>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <input
                  type="checkbox"
                  checked={form.confirmed}
                  onChange={(event) => update("confirmed", event.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-sky-700 focus:ring-sky-500"
                />
                <span className="text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">
                  I confirm that I own this account or am legally authorized to make this request. I understand KunThai must verify identity before acting.
                </span>
              </label>

              {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</p> : null}

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <a href={mailHref} className="inline-flex items-center gap-2 text-sm font-black text-sky-700 hover:text-sky-800 dark:text-sky-300">
                  <HiOutlineShieldCheck className="text-xl" /> Email privacy support
                </a>
                <button
                  type="submit"
                  disabled={busy}
                  className={`h-12 rounded-2xl px-6 text-sm font-black text-white transition disabled:cursor-wait disabled:opacity-60 ${isDeletion ? "bg-rose-600 hover:bg-rose-700" : "bg-sky-700 hover:bg-sky-800"}`}
                >
                  {busy ? "Submitting…" : "Submit request"}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
