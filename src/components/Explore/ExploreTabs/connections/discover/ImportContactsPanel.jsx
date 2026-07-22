import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HiOutlineUserGroup, HiOutlineArrowPath } from "react-icons/hi2";

import {
  isContactPickerSupported,
  matchContactsToKunThaiAccounts,
  parsePastedNumbers,
  pickDeviceContactNumbers,
} from "../../../../../Backend/services/contactMatchService";
import Avatar from "../../../shared/Avatar";
import { useI18n } from "../../../../../i18n";

// Facebook-style "find your contacts" surface. Matched accounts render inline as
// connect cards. Browsers cannot silently read the whole address book, so on
// supported devices we open the OS contact picker (user selects), and on desktop
// we accept pasted numbers — either way results appear right here, not a dialog.

export default function ImportContactsPanel({ onFollow, onViewProfile }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [connected, setConnected] = useState(() => new Set());

  async function runMatch(numbers) {
    if (!numbers.length) {
      setError(t("importContacts.noMatches"));
      return;
    }
    setBusy(true);
    setError("");

    try {
      const matches = await matchContactsToKunThaiAccounts(numbers);
      setResults(matches);
      setExpanded(true);
    } catch (matchError) {
      setError(matchError.message || t("importContacts.noMatches"));
    } finally {
      setBusy(false);
    }
  }

  async function handleScan() {
    if (isContactPickerSupported()) {
      try {
        const numbers = await pickDeviceContactNumbers();
        await runMatch(numbers);
      } catch (pickError) {
        if (pickError?.name !== "AbortError") {
          setError(pickError.message || t("importContacts.noMatches"));
        }
      }
      return;
    }
    // Desktop / unsupported: reveal the paste box.
    setExpanded(true);
  }

  function connect(match) {
    setConnected((current) => new Set(current).add(match.userId));
    onFollow?.({ user_id: match.userId, id: match.userId, identity_type: "profile", identity_id: match.userId });
  }

  return (
    <section className="mb-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[24px] border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-white text-sky-700 shadow-sm">
          <HiOutlineUserGroup className="text-2xl" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-950">{t("importContacts.title")}</p>
          <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-600">{t("importContacts.subtitle")}</p>
        </div>
        <motion.button
          type="button"
          onClick={handleScan}
          disabled={busy}
          whileTap={{ scale: 0.97 }}
          className="kt-pressable inline-flex h-10 flex-none items-center gap-2 rounded-full bg-slate-950 px-4 text-xs font-black text-white disabled:opacity-60"
        >
          {busy ? <HiOutlineArrowPath className="animate-spin text-base" /> : null}
          {busy ? t("importContacts.searching") : t("importContacts.button")}
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              {!isContactPickerSupported() && results === null ? (
                <div className="space-y-3">
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
                    className="h-11 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60"
                  >
                    {busy ? t("importContacts.searching") : t("importContacts.search")}
                  </button>
                </div>
              ) : null}

              {results !== null ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{t("importContacts.matchesTitle")}</p>
                    <button type="button" onClick={() => { setResults(null); setExpanded(false); setPasted(""); }} className="text-xs font-black text-slate-500">
                      {t("common.close")}
                    </button>
                  </div>
                  {results.length ? (
                    results.map((match, index) => (
                      <motion.div
                        key={match.userId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04 }}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
                      >
                        <button type="button" onClick={() => onViewProfile?.({ userId: match.userId, displayName: match.displayName, avatarUrl: match.avatarUrl })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <Avatar name={match.displayName} src={match.avatarUrl} size="md" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950">{match.displayName}</p>
                            <p className="truncate text-xs font-semibold text-slate-500">{match.username ? `@${match.username}` : match.publicUserId}</p>
                          </div>
                        </button>
                        <motion.button
                          type="button"
                          onClick={() => connect(match)}
                          disabled={connected.has(match.userId)}
                          whileTap={{ scale: 0.95 }}
                          className={`h-9 flex-none rounded-full px-4 text-xs font-black ${
                            connected.has(match.userId) ? "bg-slate-100 text-slate-400" : "bg-slate-950 text-white"
                          }`}
                        >
                          {connected.has(match.userId) ? t("switchAccount.active") : "Connect"}
                        </motion.button>
                      </motion.div>
                    ))
                  ) : (
                    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-600">{t("importContacts.noMatches")}</p>
                  )}
                </div>
              ) : null}

              {error ? <p className="mt-3 text-xs font-bold text-rose-600" role="alert">{error}</p> : null}
              <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-500">{t("importContacts.privacy")}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
