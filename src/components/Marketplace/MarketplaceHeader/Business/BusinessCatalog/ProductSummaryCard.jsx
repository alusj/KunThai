
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";export default function ProductSummaryCard({ label, value, tone = "gray" }) {
  useUiLocale();
  const tones = {
    gray: "bg-white text-gray-950",
    green: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-800",
    blue: "bg-blue-50 text-blue-800",
  };

  return (
    <div className={`rounded-lg border border-gray-200 p-4 ${tones[tone]}`}>
      <p className="text-sm font-bold opacity-75">{translateUi(label)}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}
