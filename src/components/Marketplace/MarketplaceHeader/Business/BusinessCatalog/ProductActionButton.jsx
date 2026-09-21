
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";export default function ProductActionButton({ label, onClick }) {
  useUiLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-800 transition hover:bg-gray-50 sm:w-auto"
    >
      {translateUi(label)}
    </button>
  );
}
