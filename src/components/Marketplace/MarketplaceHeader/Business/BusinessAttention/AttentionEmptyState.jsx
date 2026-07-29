import { CheckCircle2 } from "lucide-react";

import { useI18n, t } from "../../../../../i18n";

export default function AttentionEmptyState() {
  useI18n();
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
      <CheckCircle2 className="mx-auto text-emerald-600" size={30} strokeWidth={2.4} />
      <h4 className="mt-3 font-black text-gray-950">{t("urmall.biz.attn.allClear")}</h4>
      <p className="mt-1 text-sm font-medium text-gray-500">
        {t("urmall.biz.attn.allClearDesc")}
      </p>
    </div>
  );
}
