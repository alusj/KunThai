import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { HiOutlineArrowLeft, HiOutlineShieldCheck, HiOutlineSparkles } from "react-icons/hi2";

import { AI_CONSENT_EVENT } from "../../Backend/services/ai/aiConsent";
import { t, useI18n as useUiLocale } from "../../i18n/index.js";

// Only downloaded when someone opens the policy from the card.
const TermsPoliciesScreen = lazy(() => import("../Explore/SocialMenu/terms/TermsPoliciesScreen.jsx"));

// KAI — the one-time "KAI is powered by Google Gemini" permission card.
// Answers the promise ensureAiConsent() is waiting on. Sits above the KAI sheet
// and chat panel, since it can be raised from inside either.
export default function AiConsentPrompt() {
  useUiLocale();
  const [resolver, setResolver] = useState(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const policyScrollRef = useRef(null);

  useEffect(() => {
    function onRequest(event) {
      const detail = event.detail;
      if (!detail || detail.handled) return;
      detail.handled = true;
      // Drop the keyboard so the whole card fits on screen.
      document.activeElement?.blur?.();
      setResolver(() => detail.resolve);
    }
    window.addEventListener(AI_CONSENT_EVENT, onRequest);
    return () => window.removeEventListener(AI_CONSENT_EVENT, onRequest);
  }, []);

  // Open the policy at its KAI section. The policy is lazy and keeps growing
  // for a moment after it mounts, so keep re-aiming until the spot holds still,
  // and stop as soon as the person scrolls themselves.
  useEffect(() => {
    if (!policyOpen) return undefined;
    const box = policyScrollRef.current;
    let steady = 0;
    let tries = 0;
    const stop = () => window.clearInterval(timer);
    const timer = window.setInterval(() => {
      tries += 1;
      const section = box?.querySelector("#policy-section-kai-assistant");
      if (section) {
        const target = section.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12;
        if (Math.abs(box.scrollTop - target) > 2) {
          box.scrollTop = target;
          steady = 0;
        } else {
          steady += 1;
        }
      }
      if (steady >= 3 || tries >= 25) stop();
    }, 120);
    box?.addEventListener("touchstart", stop, { passive: true });
    box?.addEventListener("wheel", stop, { passive: true });
    return () => {
      stop();
      box?.removeEventListener("touchstart", stop);
      box?.removeEventListener("wheel", stop);
    };
  }, [policyOpen]);

  function answer(granted) {
    resolver?.(granted);
    setResolver(null);
    setPolicyOpen(false);
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
            <button
              type="button"
              onClick={() => setPolicyOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-black text-sky-600 underline-offset-2 hover:underline"
            >
              <HiOutlineShieldCheck className="text-base" />
              {t("aiConsent.privacy")}
            </button>
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

          {/* The Privacy Policy's KAI section, over the card; Back returns to it. */}
          {policyOpen ? (
            <div className="fixed inset-0 z-[1] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={t("aiConsent.privacy")}>
              <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
                <button
                  type="button"
                  onClick={() => setPolicyOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-800 active:scale-[0.98]"
                >
                  <HiOutlineArrowLeft className="text-base" />
                  {t("aiConsent.back")}
                </button>
              </div>
              <div ref={policyScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">
                <Suspense fallback={null}>
                  <TermsPoliciesScreen hideHeader initialPolicyId="privacy" />
                </Suspense>
              </div>
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
