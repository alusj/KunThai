import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ShieldCheck, Sparkles, Store, Truck } from "lucide-react";
import { t, t as i18nText } from "../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";
import {
  REGISTRATION_KINDS,
  completionCopy,
  creepToward,
  progressCeiling,
  progressPercent,
  stageList,
} from "../../Backend/services/registration/registrationTaskCore";

// Full-screen "we are setting up your account" experience shown while a UrMall
// or UrRide registration is saving and the dashboard is being prepared.
//
// With `progress` (a background registration task) it shows the real steps —
// checking, uploading N of M files, creating the account, finishing — and,
// with `onBack`, a Back button plus a calm note that the save carries on in
// the background. Without `progress` it cycles through friendly steps, as it
// always did. It only disappears once `open` goes false.

const SECTORS = {
  urmall: {
    label: "UrMall",
    icon: Store,
    from: "#059669",
    to: "#0f766e",
    ring: "rgb(16 185 129 / 0.35)",
    steps: [
      "Setting up your store",
      "Checking security",
      "Saving your business details",
      "Preparing your dashboard",
    ],
  },
  urride: {
    label: "UrRide",
    icon: Truck,
    from: "#16a34a",
    to: "#047857",
    ring: "rgb(34 197 94 / 0.35)",
    steps: [
      "Setting up your fleet",
      "Checking security",
      "Registering your operator profile",
      "Preparing your dashboard",
    ],
  },
};

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const SLOW_NOTE_AFTER_MS = 20000;

function defaultKind(sector) {
  return sector === "urride" ? REGISTRATION_KINDS.URRIDE_SOLO : REGISTRATION_KINDS.URMALL;
}

// The bar follows the real steps; inside a long step it drifts slowly toward
// (never past) the next one so the screen never looks frozen.
function useDisplayedPercent(progress, open, reduceMotion) {
  const target = progress ? progressPercent(progress) : 0;
  const ceiling = progress ? progressCeiling(progress) : 0;
  const [shown, setShown] = useState(target);
  const ceilingRef = useRef(ceiling);
  const targetRef = useRef(target);
  ceilingRef.current = ceiling;
  targetRef.current = target;

  useEffect(() => {
    setShown((current) => (open ? Math.max(target, reduceMotion ? 0 : current) : 0));
  }, [open, reduceMotion, target]);

  useEffect(() => {
    if (!open || !progress || reduceMotion) return undefined;
    const timer = window.setInterval(() => {
      setShown((current) => creepToward(current, targetRef.current, ceilingRef.current));
    }, 700);
    return () => window.clearInterval(timer);
  }, [open, progress, reduceMotion]);

  return Math.min(100, Math.max(0, shown));
}

function StageIcon({ state, color, reduceMotion }) {
  if (state === "done") {
    return (
      <motion.span
        className="grid h-6 w-6 flex-none place-items-center rounded-full text-white"
        style={{ background: color }}
        initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
      >
        <Check size={14} strokeWidth={3} aria-hidden="true" />
      </motion.span>
    );
  }
  if (state === "active") {
    return (
      <span className="relative grid h-6 w-6 flex-none place-items-center" aria-hidden="true">
        {reduceMotion ? null : (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ border: `2px solid ${color}` }}
            animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      </span>
    );
  }
  return <span className="h-6 w-6 flex-none rounded-full border-2 border-white/20" aria-hidden="true" />;
}

export default function AccountSetupLoader({ open, sector = "urmall", kind, progress: liveProgress = null, onBack }) {
  useUiLocale();
  const reduceMotion = useReducedMotion();
  // When the save finishes the screen keeps this open for its closing
  // animation; hold the last real steps so the checklist does not jump back
  // to the generic look for that moment.
  const [heldProgress, setHeldProgress] = useState(liveProgress);
  useEffect(() => {
    if (liveProgress) setHeldProgress(liveProgress);
    else if (!open) setHeldProgress(null);
  }, [liveProgress, open]);
  const progress = liveProgress || (open ? heldProgress : null);
  const config = SECTORS[sector] || SECTORS.urmall;
  const registrationKind = kind || defaultKind(sector);
  const copy = completionCopy(registrationKind);
  const titleId = useId();
  const [stepIndex, setStepIndex] = useState(0);
  const [slow, setSlow] = useState(false);
  const percent = useDisplayedPercent(progress, open, reduceMotion);
  const backRef = useRef(null);

  useEffect(() => {
    if (!open || progress) {
      setStepIndex(0);
      return undefined;
    }
    // Advance through the steps, holding on the last one until the dashboard
    // is ready (open flips to false).
    const timer = window.setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, config.steps.length - 1));
    }, 1400);
    return () => window.clearInterval(timer);
  }, [open, progress, config.steps.length]);

  useEffect(() => {
    if (!open) {
      setSlow(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setSlow(true), SLOW_NOTE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Keyboard and screen-reader users land on the way out first.
  useEffect(() => {
    if (!open || !onBack) return undefined;
    const frame = window.requestAnimationFrame(() => backRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open, onBack]);

  if (typeof document === "undefined") return null;

  const SectorIcon = config.icon;
  const stages = progress ? stageList(registrationKind, progress) : null;
  const activeStage = stages?.find((stage) => stage.state === "active") || null;
  const cycledProgress = ((stepIndex + 1) / config.steps.length) * 100;
  const ringPercent = progress ? percent : cycledProgress;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="account-setup-loader"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-[2147483000] overflow-y-auto overscroll-contain backdrop-blur-xl"
          style={{ background: `radial-gradient(circle at 50% 30%, ${config.from}38, transparent 62%), rgb(2 6 23 / 0.96)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.3 } }}
        >
          {reduceMotion ? null : (
            <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
              <motion.span
                className="absolute -left-24 top-1/4 h-72 w-72 rounded-full blur-3xl"
                style={{ background: `${config.from}26` }}
                animate={{ x: [0, 40, 0], y: [0, -24, 0] }}
                transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.span
                className="absolute -right-24 bottom-1/4 h-80 w-80 rounded-full blur-3xl"
                style={{ background: `${config.to}22` }}
                animate={{ x: [0, -36, 0], y: [0, 28, 0] }}
                transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          )}

          <div
            className="relative flex min-h-full flex-col px-4"
            style={{
              paddingTop: "calc(var(--kt-safe-area-top, 0px) + 0.75rem)",
              paddingBottom: "calc(var(--kt-safe-area-bottom, 0px) + 1.5rem)",
            }}
          >
            <div className="flex h-12 items-center">
              {onBack ? (
                <button
                  ref={backRef}
                  type="button"
                  onClick={onBack}
                  aria-label={t("registrationSaving.backAria")}
                  className="kt-pressable flex h-11 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 pl-2.5 pr-4 text-sm font-black text-white backdrop-blur transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <ChevronLeft size={20} strokeWidth={3} aria-hidden="true" />
                  {t("registrationSaving.back")}
                </button>
              ) : null}
            </div>

            <div className="flex flex-1 items-center justify-center py-4">
              <motion.div
                className="relative flex w-full max-w-sm flex-col items-center text-center"
                initial={reduceMotion ? false : { scale: 0.94, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
              >
                <div className="relative grid h-32 w-32 place-items-center">
                  {reduceMotion ? null : [0, 1, 2].map((ring) => (
                    <motion.span
                      key={ring}
                      className="absolute inset-2 rounded-full"
                      style={{ border: `2px solid ${config.ring}` }}
                      initial={{ scale: 0.6, opacity: 0.7 }}
                      animate={{ scale: 1.45, opacity: 0 }}
                      transition={{ duration: 2.4, repeat: Infinity, delay: ring * 0.6, ease: "easeOut" }}
                    />
                  ))}
                  <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
                    <circle cx="60" cy="60" r={RING_RADIUS} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="5" />
                    <motion.circle
                      cx="60"
                      cy="60"
                      r={RING_RADIUS}
                      fill="none"
                      stroke={config.from}
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={RING_LENGTH}
                      initial={false}
                      animate={{ strokeDashoffset: RING_LENGTH * (1 - Math.max(2, ringPercent) / 100) }}
                      transition={{ duration: reduceMotion ? 0 : 0.7, ease: "easeOut" }}
                    />
                  </svg>
                  <span
                    className="grid h-16 w-16 place-items-center rounded-3xl text-white shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${config.from}, ${config.to})`, boxShadow: `0 18px 40px ${config.ring}` }}
                  >
                    <SectorIcon size={30} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                </div>

                <p className="mt-6 text-xs font-black uppercase tracking-[0.28em] text-white/60">{translateUi(config.label)}</p>
                <h2 id={titleId} className="mt-1 text-2xl font-black leading-tight text-white">
                  {progress ? t(`registrationSaving.${copy.titleKey}`) : i18nText("ui.literals.k005287e2bca1")}
                </h2>

                {stages ? (
                  <>
                    <p className="sr-only" role="status" aria-live="polite">
                      {activeStage ? t(`registrationSaving.${activeStage.labelKey}`, activeStage.params) : ""}
                    </p>
                    <ol
                      aria-label={t("registrationSaving.stepsLabel")}
                      className="mt-6 w-full space-y-1 rounded-3xl border border-white/10 bg-white/[0.06] p-3 text-left backdrop-blur"
                    >
                      {stages.map((stage) => (
                        <li
                          key={stage.id}
                          className={`flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors duration-300 ${
                            stage.state === "active" ? "bg-white/[0.07]" : ""
                          }`}
                        >
                          <StageIcon state={stage.state} color={config.from} reduceMotion={reduceMotion} />
                          <span
                            className={`min-w-0 flex-1 text-sm font-bold leading-5 ${
                              stage.state === "pending" ? "text-white/45" : stage.state === "done" ? "text-white/75" : "text-white"
                            }`}
                          >
                            {t(`registrationSaving.${stage.labelKey}`, stage.params)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <>
                    <div className="mt-5 h-8 w-full overflow-hidden">
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={stepIndex}
                          className="flex items-center justify-center gap-2 text-sm font-bold text-white/90"
                          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                          transition={{ duration: 0.28 }}
                        >
                          {stepIndex >= 1 ? <ShieldCheck size={15} className="text-white/70" /> : <Sparkles size={15} className="text-white/70" />}
                          {translateUi(config.steps[stepIndex])}
                        </motion.p>
                      </AnimatePresence>
                    </div>

                    <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${config.from}, ${config.to})` }}
                        animate={{ width: `${cycledProgress}%` }}
                        transition={{ duration: reduceMotion ? 0 : 0.5, ease: "easeOut" }}
                      />
                    </div>
                  </>
                )}

                <p className="mt-5 text-sm font-semibold leading-6 text-white/70">
                  {progress
                    ? onBack
                      ? t(`registrationSaving.${copy.waitKey}`)
                      : t("registrationSaving.waitStay")
                    : i18nText("ui.literals.k2ce331b1a2fc")}
                </p>

                <AnimatePresence>
                  {slow && progress ? (
                    <motion.p
                      className="mt-3 text-xs font-semibold leading-5 text-white/50"
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      {onBack ? t("registrationSaving.slowNote") : t("registrationSaving.slowNoteStay")}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
