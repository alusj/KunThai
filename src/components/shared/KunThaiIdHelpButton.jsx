import { motion } from "framer-motion";
import { ClipboardCopy, HelpCircle, Search, ShieldCheck } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { useI18n } from "../../i18n";
import CenteredModal from "./CenteredModal";

const TONES = {
  blue: "from-blue-500 to-blue-700 shadow-blue-500/25",
  emerald: "from-emerald-500 to-emerald-700 shadow-emerald-500/25",
  sky: "from-sky-500 to-sky-700 shadow-sky-500/25",
};

export default function KunThaiIdHelpButton({ subject = "person", tone = "blue", className = "" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const toneClass = TONES[tone] || TONES.blue;
  const subjectKey = {
    "business administrator": "businessAdmin",
    "credit recipient": "creditRecipient",
    operator: "operator",
    person: "person",
    "team member": "teamMember",
  }[subject] || "person";
  const subjectLabel = t(`profile.idSubject${subjectKey[0].toUpperCase()}${subjectKey.slice(1)}`);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.1, rotate: 5 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 420, damping: 18 }}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br text-sm font-black text-white shadow-md ${toneClass} ${className}`}
        aria-label={t("profile.idHelpAria")}
        title={t("profile.idHelpTitle")}
      >
        ?
      </motion.button>

      <CenteredModal open={open} onClose={() => setOpen(false)} labelledBy={titleId} maxWidth="max-w-md">
        <div className="flex items-start gap-3">
          <motion.span
            initial={{ scale: 0.75, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 20 }}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${toneClass}`}
          >
            <HelpCircle size={23} />
          </motion.span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">{t("profile.idGuide")}</p>
            <h2 id={titleId} className="mt-1 text-xl font-black text-slate-950">{t("profile.idFindAdd", { subject: subjectLabel })}</h2>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <HelpStep icon={Search} number="1" title={t("profile.idStep1Title", { subject: subjectLabel })} body={t("profile.idStep1Body")} />
          <HelpStep icon={ClipboardCopy} number="2" title={t("profile.idStep2Title")} body={t("profile.idStep2Body")} />
          <HelpStep icon={ShieldCheck} number="3" title={t("profile.idStep3Title")} body={t("profile.idStep3Body")} />
        </div>

        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-900">
          {t("profile.idConfirmSafety")}
        </p>
        <button type="button" onClick={() => setOpen(false)} className="mt-5 h-12 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
          {t("profile.understood")}
        </button>
      </CenteredModal>
    </>
  );
}

function HelpStep({ body, icon: Icon, number, title }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Number(number) * 0.05, duration: 0.22 }}
      className="flex gap-3 rounded-2xl bg-slate-50 p-3"
    >
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm">
        <Icon size={18} />
        <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-blue-700 text-[10px] font-black text-white">{number}</span>
      </span>
      <div className="min-w-0">
        <p className="text-sm font-black text-slate-950">{title}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{body}</p>
      </div>
    </motion.div>
  );
}
