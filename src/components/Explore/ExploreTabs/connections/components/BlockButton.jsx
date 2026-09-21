
import { t as i18nText } from "../../../../../i18n/index";
import { useI18n as useUiLocale } from "../../../../../i18n/index.js";// src/explore/connections/components/BlockButton.jsx
export default function BlockButton() {
  useUiLocale();
  return (
    <button className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100">
      {i18nText("ui.literals.k82dd2cdf36f9")}
    </button>
  );
}
