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
import { t as i18nText } from "../../i18n/index";

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
      setError(i18nText("ui.literals.k2993549da5bd"));
      return;
    }
    if (!form.confirmed) {
      setError(i18nText("ui.literals.ka18d150563c3"));
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
      setError(submitError.message || i18nText("ui.literals.k2d70d1b8ad29"));
    } finally {
      setBusy(false);
    }
  }

  const mailSubject = encodeURIComponent(isDeletion ? "KunThai account deletion request" : "KunThai data access request");
  const mailHref = `mailto:${legalConfig.privacyEmail}?subject=${mailSubject}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 px-4 py-6" role="presentation">
      <button type="button" aria-label={i18nText("ui.literals.k4b3176e647d1")} onClick={() => !busy && onClose?.()} className="absolute inset-0 cursor-default" />
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
          aria-label={i18nText("ui.literals.kbbfa773e5a63")}
        >
          <HiOutlineXMark className="text-xl" />
        </button>

        {receipt ? (
          <div className="py-4 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <HiOutlineCheckCircle className="text-4xl" />
            </span>
            <h2 id={titleId} className="mt-5 text-2xl font-black text-slate-950 dark:text-white">{i18nText("ui.literals.kd5656f0ed572")}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              {i18nText("ui.literals.k8ab0e2d2fce2")} {isDeletion ? i18nText("ui.literals.k0c759066f86c") : i18nText("ui.literals.k855f632a1ffa")} {i18nText("ui.literals.k3cd2720e660e")}
            </p>
            <p className="mx-auto mt-4 w-fit rounded-2xl bg-slate-100 px-5 py-3 font-mono text-base font-black tracking-wide text-slate-950 dark:bg-slate-800 dark:text-white">
              {receipt.reference}
            </p>
            <p className="mt-4 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
              {i18nText("ui.literals.kb03c2ed8f2aa")}
            </p>
            <button type="button" onClick={onClose} className="mt-6 h-12 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500">
              {i18nText("ui.literals.ke9b450d14bc2")}
            </button>
          </div>
        ) : (
          <>
            <div className={`grid h-14 w-14 place-items-center rounded-2xl ${isDeletion ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"}`}>
              {isDeletion ? <HiOutlineTrash className="text-3xl" /> : <HiOutlineCircleStack className="text-3xl" />}
            </div>
            <h2 id={titleId} className="mt-4 pr-12 text-2xl font-black text-slate-950 dark:text-white">
              {isDeletion ? i18nText("ui.literals.k08caa3db9ffd") : i18nText("ui.literals.k935eec6f03bb")}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              {isDeletion
                ? i18nText("ui.literals.k1fa9325b45d9")
                : i18nText("ui.literals.k666105519041")}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                <label>{i18nText("ui.literals.k2e8a57cc5c47")}<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} /></label>
              </div>

              <RequestField label={i18nText("ui.literals.keeb692087d62")} required>
                <input
                  required
                  autoComplete="name"
                  value={form.fullName}
                  onChange={(event) => update("fullName", event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-sky-950"
                />
              </RequestField>

              <div className="grid gap-4 sm:grid-cols-2">
                <RequestField label={i18nText("ui.literals.kd705c691c087")} hint="Enter this or the account phone number.">
                  <input
                    type="email"
                    autoComplete="email"
                    value={form.accountEmail}
                    onChange={(event) => update("accountEmail", event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-sky-950"
                  />
                </RequestField>
                <RequestField label={i18nText("ui.literals.kecc68a263411")} hint="Include the international country code.">
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

              <RequestField label={i18nText("ui.literals.k9127196a6d29")}>
                <input
                  autoComplete="country-name"
                  value={form.country}
                  onChange={(event) => update("country", event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-sky-950"
                />
              </RequestField>

              <RequestField label={isDeletion ? i18nText("ui.literals.k11149163ec7f") : i18nText("ui.literals.keeb19db0d05d")} hint="Do not include passwords or one-time codes.">
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
                  {i18nText("ui.literals.k06ab2563f4e9")}
                </span>
              </label>

              {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</p> : null}

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <a href={mailHref} className="inline-flex items-center gap-2 text-sm font-black text-sky-700 hover:text-sky-800 dark:text-sky-300">
                  <HiOutlineShieldCheck className="text-xl" /> {i18nText("ui.literals.kda4e266147b2")}
                </a>
                <button
                  type="submit"
                  disabled={busy}
                  className={`h-12 rounded-2xl px-6 text-sm font-black text-white transition disabled:cursor-wait disabled:opacity-60 ${isDeletion ? "bg-rose-600 hover:bg-rose-700" : "bg-sky-700 hover:bg-sky-800"}`}
                >
                  {busy ? i18nText("ui.literals.k25bdf9860e96") : i18nText("ui.literals.k8a9051c61379")}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
