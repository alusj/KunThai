
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";// Single insight row with status color

export default function InsightItem({ label, status }) {
  useUiLocale();
  const colors = {
    positive: "text-green-600",
    warning: "text-yellow-600",
    danger: "text-red-600",
  };

  return (
    <div className="rounded-lg border bg-white p-3 flex items-center">
      <span className={`text-sm font-medium ${colors[status]}`}>
        {translateUi(label)}
      </span>
    </div>
  );
}
