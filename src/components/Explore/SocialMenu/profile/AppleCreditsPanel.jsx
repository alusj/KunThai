import { useEffect, useState } from "react";
import { HiOutlineSparkles } from "react-icons/hi2";

import { buyAppleCredits, loadAppleCreditPacks } from "../../../../Backend/services/appleIapService";
import { buyGooglePlayCredits, loadGooglePlayCreditPacks } from "../../../../Backend/services/googlePlayBillingService";
import { t, useI18n as useUiLocale } from "../../../../i18n/index.js";

// The store's lines; everything else in the panel names no store.
const STORES = {
  apple: { loadPacks: loadAppleCreditPacks, buyPack: buyAppleCredits, copy: "appleIap" },
  google: { loadPacks: loadGooglePlayCreditPacks, buyPack: buyGooglePlayCredits, copy: "googlePlayBilling" },
};

// "Buy credits" in the store apps: the store's own packs only. iOS: Apple
// In-App Purchase (App Store Review Guideline 3.1.1). Android (store="google"):
// Google Play Billing (Play payments policy). The web shows the Monime methods.
export default function AppleCreditsPanel({ onClose, store = "apple" }) {
  useUiLocale();
  const { loadPacks, buyPack, copy } = STORES[store] || STORES.apple;
  const [packs, setPacks] = useState(null); // null = loading
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState(null); // { tone, text }

  useEffect(() => {
    let active = true;
    loadPacks()
      .then((items) => { if (active) setPacks(items); })
      .catch(() => { if (active) setPacks([]); });
    return () => { active = false; };
  }, [loadPacks]);

  async function buy(pack) {
    if (busyId) return;
    setBusyId(pack.productId);
    setMessage({ tone: "info", text: t(`${copy}.buying`) });
    try {
      const result = await buyPack(pack.productId);
      if (result.status === "added") {
        setMessage({ tone: "success", text: t("appleIap.added", { credits: result.credits }) });
      } else if (result.status === "delayed") {
        setMessage({ tone: "info", text: t("appleIap.delayed") });
      } else if (result.status === "pending") {
        setMessage({ tone: "info", text: t(`${copy}.pending`) });
      } else if (result.status === "refused") {
        setMessage({ tone: "error", text: t("appleIap.failed") });
      } else {
        setMessage(null); // cancelled in the store's sheet
      }
    } catch {
      setMessage({ tone: "error", text: t("appleIap.failed") });
    } finally {
      setBusyId("");
    }
  }

  const tones = {
    info: "bg-sky-50 text-sky-800",
    success: "bg-emerald-50 text-emerald-800",
    error: "bg-rose-50 text-rose-800",
  };

  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-white shadow-md shadow-sky-500/30">
          <HiOutlineSparkles className="text-2xl" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{t("exploreProfileFix.visibilityCredits")}</p>
          <h2 id="buy-credits-title" className="mt-1 text-xl font-black text-slate-950">{t("buyCredits.title")}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">{t(`${copy}.intro`)}</p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {packs === null ? (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500" role="status">{t("appleIap.loading")}</p>
        ) : !packs.length ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800" role="alert">{t("appleIap.unavailable")}</p>
        ) : (
          packs.map((pack) => (
            <button
              key={pack.productId}
              type="button"
              onClick={() => buy(pack)}
              disabled={Boolean(busyId)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-sky-300 disabled:opacity-60"
            >
              <span className="text-sm font-black text-slate-950">{t("appleIap.pack", { credits: pack.credits })}</span>
              <span className="rounded-xl bg-sky-700 px-3 py-1.5 text-sm font-black text-white">
                {busyId === pack.productId ? "…" : pack.displayPrice || t("appleIap.buy")}
              </span>
            </button>
          ))
        )}
      </div>

      {message ? (
        <p className={`mt-3 rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${tones[message.tone]}`} role="status">{message.text}</p>
      ) : null}

      <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{t(`${copy}.note`)}</p>

      <button type="button" onClick={onClose} disabled={Boolean(busyId)} className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-60">
        {t("common.close")}
      </button>
    </div>
  );
}
