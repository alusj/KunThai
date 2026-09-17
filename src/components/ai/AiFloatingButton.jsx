import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { useI18n } from "../../i18n";
import { useAiAvailability } from "../../Backend/hooks/useAiTask";
import { aiSurfaceLabel, openAiChat, useAiSurface } from "../../Backend/services/ai/aiSurfaceService";

// KAI — the one floating entry point to the assistant.
//
// Mounted once in App.jsx. It opens the conversation for whatever section and
// role the person is currently in (a seller workspace, an operator dashboard,
// UrMall shopping, Explore…), so the assistant arrives already knowing the
// context. It steps out of the way whenever KunThai shows a full-screen flow
// (composer, product detail, Area View, trips) — the same moments the bottom
// tabs hide — so it never covers a map, a form or a checkout button.

export default function AiFloatingButton({ hidden = false }) {
  const { t } = useI18n();
  const { available, checked } = useAiAvailability();
  const context = useAiSurface();

  if (hidden || !checked || !available) return null;

  return (
    <motion.button
      type="button"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      onClick={() => openAiChat({ surface: context.surface, role: context.role, screen: context.screen })}
      aria-label={t("ai.fab.label", { section: aiSurfaceLabel(context.surface) })}
      title={t("ai.fab.label", { section: aiSurfaceLabel(context.surface) })}
      className="fixed right-3 z-[70] grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-sky-800 text-white shadow-lg shadow-slate-950/30 ring-1 ring-white/10 sm:right-5"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.25rem)" }}
    >
      <Sparkles size={20} />
    </motion.button>
  );
}
