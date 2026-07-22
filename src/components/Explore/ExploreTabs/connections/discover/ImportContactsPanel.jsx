import { useState } from "react";
import { createPortal } from "react-dom";
import { HiOutlineUserGroup, HiOutlineXMark } from "react-icons/hi2";

import {
  isContactPickerSupported,
  matchContactsToKunThaiAccounts,
  parsePastedNumbers,
  pickDeviceContactNumbers,
} from "../../../../../Backend/services/contactMatchService";
import Avatar from "../../../shared/Avatar";
import { useI18n } from "../../../../../i18n";

export default function ImportContactsPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);

  async function runMatch(numbers) {
    if (!numbers.length) return;
    setBusy(true);
    setError("");

    try {
      const matches = await matchContactsToKunThaiAccounts(numbers);
      setResults(matches);
    } catch (matchError) {
      setError(matchError.message || t("importContacts.noMatches"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDevicePick() {
    try {
      const numbers = await pickDeviceContactNumbers();
      await runMatch(numbers);
    } catch (pickError) {
      if (pickError?.name !== "AbortError") {
        setError(pickError.message || t("importContacts.noMatches"));
      }
    }
  }

  function openMatchedProfile(match) {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("kuntai-open-profile", {
      detail: { userId: match.userId, displayName: match.displayName, avatarUrl: match.avatarUrl },
    }));
  }

  return (
    <>
      <section className="mb-3 flex flex-wrap items-center gap-3 rounded-[24px] border border-sky-200 bg-sky-50/70 p-4">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-white text-sky-700">
          <HiOutlineUserGroup className="text-2xl" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-950">{t("importContacts.title")}</p>
          <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-600">{t("importContacts.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setResults(null);
            setError("");
            setOpen(true);
          }}
          className="kt-pressable h-10 flex-none rounded-full bg-slate-950 px-4 text-xs font-black text-white"
        >
          {t("importContacts.button")}
        </button>
      </section>

      {open && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[2147483000] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-contacts-title"
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[28px] border border-sky-100 bg-white p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Connections</p>
                <h2 id="import-contacts-title" className="mt-1 text-xl font-black text-slate-950">{t("importContacts.title")}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className="grid h-10 w-10 flex-none place-items-center rounded-full bg-slate-100 text-slate-600">
                <HiOutlineXMark className="text-xl" />
              </button>
            </div>

            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{t("importContacts.subtitle")}</p>
            <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-600">{t("importContacts.privacy")}</p>

            {results === null ? (
              <div className="mt-4 space-y-3">
                {isContactPickerSupported() ? (
                  <button
                    type="button"
                    onClick={handleDevicePick}
                    disabled={busy}
                    className="h-12 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60"
                  >
                    {busy ? t("importContacts.searching") : t("importContacts.button")}
                  </button>
                ) : null}

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t("importContacts.pasteLabel")}</span>
                  <textarea
                    value={pasted}
                    onChange={(event) => setPasted(event.target.value)}
                    rows={4}
                    placeholder={"+232 76 000 000\n+234 803 000 0000"}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-sky-400"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => runMatch(parsePastedNumbers(pasted))}
                  disabled={busy || !parsePastedNumbers(pasted).length}
                  className="h-12 w-full rounded-2xl border border-sky-300 bg-sky-50 px-4 text-sm font-black text-sky-700 disabled:opacity-60"
                >
                  {busy ? t("importContacts.searching") : t("importContacts.search")}
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{t("importContacts.matchesTitle")}</p>
                {results.length ? (
                  results.map((match) => (
                    <div key={match.userId} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                      <Avatar name={match.displayName} src={match.avatarUrl} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-slate-950">{match.displayName}</p>
                        <p className="truncate text-xs font-semibold text-slate-500">{match.username ? `@${match.username}` : match.publicUserId}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openMatchedProfile(match)}
                        className="h-9 flex-none rounded-full bg-slate-950 px-3 text-xs font-black text-white"
                      >
                        {t("importContacts.openProfile")}
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-600">{t("importContacts.noMatches")}</p>
                )}
                <button
                  type="button"
                  onClick={() => setResults(null)}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
                >
                  {t("common.back")}
                </button>
              </div>
            )}

            {error ? <p className="mt-3 text-xs font-bold text-rose-600" role="alert">{error}</p> : null}
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
