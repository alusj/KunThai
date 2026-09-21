import { useI18n, t } from "../../../../../i18n";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";

export default function AttentionSummary({ summary }) {
  useI18n();
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <SummaryPill label={t("urmall.biz.attn.urgent")} value={summary.high} tone="text-red-700 bg-red-50" />
      <SummaryPill label={t("urmall.biz.attn.today")} value={summary.medium} tone="text-amber-700 bg-amber-50" />
      <SummaryPill label={t("urmall.biz.attn.watching")} value={summary.low} tone="text-gray-600 bg-gray-100" />
    </div>
  );
}

function SummaryPill({ label, value, tone }) {
  useUiLocale();
  return (
    <div className={`rounded-lg px-3 py-2 ${tone}`}>
      <p className="text-xs font-black uppercase">{translateUi(label)}</p>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
}
