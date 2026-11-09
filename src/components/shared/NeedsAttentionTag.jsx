import { AlertCircle } from "lucide-react";

import { t } from "../../i18n/index";
import { useI18n } from "../../i18n/index.js";

// Marks a section of an edit screen that still has something missing.
export default function NeedsAttentionTag({ className = "" }) {
  useI18n();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-800 ${className}`}>
      <AlertCircle size={12} aria-hidden="true" />
      {t("setupStatus.needsAttention")}
    </span>
  );
}
