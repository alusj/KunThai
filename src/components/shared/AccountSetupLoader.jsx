import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { ShieldCheck, Sparkles, Store, Truck } from "lucide-react";

// Full-screen "we are setting up your account" experience shown while a UrMall
// or UrRide registration is saving and the dashboard is being prepared. It
// cycles through friendly steps and only disappears once `open` goes false
// (i.e. the dashboard is ready), so the user never stares at a frozen button.

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

export default function AccountSetupLoader({ open, sector = "urmall" }) {
  const config = SECTORS[sector] || SECTORS.urmall;
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      return undefined;
    }
    // Advance through the steps, holding on the last one until the dashboard
    // is ready (open flips to false).
    const timer = window.setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, config.steps.length - 1));
    }, 1400);
    return () => window.clearInterval(timer);
  }, [open, config.steps.length]);

  if (typeof document === "undefined") return null;

  const SectorIcon = config.icon;
  const progress = ((stepIndex + 1) / config.steps.length) * 100;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="account-setup-loader"
          className="fixed inset-0 z-[2147483000] flex items-center justify-center overflow-hidden p-6"
          style={{ background: `radial-gradient(circle at 50% 30%, ${config.from}22, #020617 62%)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          <motion.div
            className="relative flex w-full max-w-sm flex-col items-center text-center"
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <div className="relative grid h-28 w-28 place-items-center">
              {[0, 1, 2].map((ring) => (
                <motion.span
                  key={ring}
                  className="absolute inset-0 rounded-full"
                  style={{ border: `2px solid ${config.ring}` }}
                  initial={{ scale: 0.6, opacity: 0.7 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 2.2, repeat: Infinity, delay: ring * 0.55, ease: "easeOut" }}
                />
              ))}
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ borderTop: `3px solid ${config.from}`, borderRight: "3px solid transparent", borderBottom: "3px solid transparent", borderLeft: "3px solid transparent" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
              />
              <span
                className="grid h-16 w-16 place-items-center rounded-3xl text-white shadow-lg"
                style={{ background: `linear-gradient(135deg, ${config.from}, ${config.to})`, boxShadow: `0 18px 40px ${config.ring}` }}
              >
                <SectorIcon size={30} strokeWidth={2.2} />
              </span>
            </div>

            <p className="mt-7 text-xs font-black uppercase tracking-[0.28em] text-white/60">{config.label}</p>
            <h2 className="mt-1 text-2xl font-black text-white">Almost there</h2>

            <div className="mt-5 h-8 w-full overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.p
                  key={stepIndex}
                  className="flex items-center justify-center gap-2 text-sm font-bold text-white/90"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.28 }}
                >
                  {stepIndex >= 1 ? <ShieldCheck size={15} className="text-white/70" /> : <Sparkles size={15} className="text-white/70" />}
                  {config.steps[stepIndex]}
                </motion.p>
              </AnimatePresence>
            </div>

            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${config.from}, ${config.to})` }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>

            <p className="mt-5 text-xs font-semibold leading-5 text-white/50">
              Please keep this screen open. Your dashboard opens the moment everything is ready.
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
