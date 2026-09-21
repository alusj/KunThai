
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";export default function PromotionMetricCard({ label, value, helper }) {
  useUiLocale();
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-bold text-gray-500">{translateUi(label)}</p>
      <p className="mt-1 text-2xl font-black text-gray-950">{value}</p>
      {helper ? <p className="mt-1 text-xs font-bold text-gray-500">{translateUi(helper)}</p> : null}
    </div>
  );
}
