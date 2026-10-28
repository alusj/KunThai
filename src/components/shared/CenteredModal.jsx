import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";

// Shared registration / confirmation modal. Always centered on every screen
// size, sits above a strong blurred backdrop so nothing behind it shows through,
// and animates in and out with a spring pop. Driven by an `open` prop so
// AnimatePresence can run the exit animation before unmounting.

const backdrop = {
  hidden: { opacity: 0 },
  shown: { opacity: 1 },
};

const card = {
  hidden: { opacity: 0, scale: 0.9, y: 28 },
  shown: { opacity: 1, scale: 1, y: 0 },
  leaving: { opacity: 0, scale: 0.94, y: 16 },
};

export default function CenteredModal({
  open,
  onClose,
  children,
  maxWidth = "max-w-md",
  labelledBy,
  dismissOnBackdrop = true,
  // A quick card that must answer at once (e.g. a caution before going
  // online): no backdrop blur, which is slow to paint over a busy screen on
  // low-end phones, and a short tween instead of the spring.
  quick = false,
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="kt-modal-backdrop"
          className={`fixed inset-0 z-[2147483000] flex items-center justify-center overflow-y-auto overscroll-contain p-4 ${quick ? "bg-slate-950/60" : "bg-slate-950/70 backdrop-blur-md"}`}
          variants={backdrop}
          initial="hidden"
          animate="shown"
          exit="hidden"
          transition={{ duration: quick ? 0.12 : 0.18 }}
          role="presentation"
          onMouseDown={dismissOnBackdrop ? onClose : undefined}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className={`relative max-h-[calc(100dvh-2rem)] w-full ${maxWidth} overflow-y-auto rounded-3xl border border-slate-100 bg-white p-5 shadow-2xl`}
            variants={card}
            initial="hidden"
            animate="shown"
            exit="leaving"
            transition={quick ? { duration: 0.16, ease: "easeOut" } : { type: "spring", stiffness: 340, damping: 27 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {children}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
