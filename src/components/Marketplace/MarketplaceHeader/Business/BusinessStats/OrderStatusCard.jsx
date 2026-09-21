
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";export default function OrderStatusCard({ label, value, tone = "gray" }) {
  useUiLocale();
  const tones = {
    gray: "border-gray-200 bg-white text-gray-950",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <p className="text-sm font-bold opacity-75">{translateUi(label)}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}
