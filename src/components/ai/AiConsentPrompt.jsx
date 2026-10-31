import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { HiOutlineSparkles } from "react-icons/hi2";

import { AI_CONSENT_EVENT } from "../../Backend/services/ai/aiConsent";
import { t, useI18n as useUiLocale } from "../../i18n/index.js";

// KAI — the one-time "KAI is powered by Google Gemini" permission card.
// Answers the promise ensureAiConsent() is waiting on. Sits above the KAI sheet
// and chat panel, since it can be raised from inside either.
export default function AiConsentPrompt() {
  useUiLocale();
  const [resolver, setResolver] = useState(null);

  useEffect(() => {
    function onRequest(event) {
      const detail = event.detail;
      if (!detail || detail.handled) return;
      detail.handled = true;
      setResolver(() => detail.resolve);
    }
    window.addEventListener(AI_CONSENT_EVENT, onRequest);
    return () => window.removeEventListener(AI_CONSENT_EVENT, onRequest);
  }, []);

  function answer(granted) {
    resolver?.(granted);
    setResolver(null);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {resolver ? (
        <motion.div
          key="kai-consent"
          className="fixed inset-0 z-[2147483200] flex items-center justify-center bg-slate-950/70 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kai-consent-title"
            className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-white shadow-md shadow-sky-500/30">
                <HiOutlineSparkles className="text-2xl" />
              </span>
              <h2 id="kai-consent-title" className="mt-2 text-xl font-black text-slate-950">{t("aiConsent.title")}</h2>
            </div>
            <p className="mt-4 text-sm font-semibold leading-relaxed text-slate-700">{t("aiConsent.body")}</p>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-500">{t("aiConsent.care")}</p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => answer(true)}
                className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-sm font-black text-white shadow-md shadow-sky-600/30 active:scale-[0.98]"
              >
                {t("aiConsent.allow")}
              </button>
              <button
                type="button"
                onClick={() => answer(false)}
                className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 active:scale-[0.98]"
              >
                {t("aiConsent.decline")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
