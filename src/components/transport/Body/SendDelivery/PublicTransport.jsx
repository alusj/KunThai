
import { t as i18nText } from "../../../../i18n/index";
import { useI18n as useUiLocale } from "../../../../i18n/index.js";// PublicTransport.jsx
// For freelance delivery using public transport

export default function PublicTransport() {
  useUiLocale();
  return (
    <button className="flex flex-col items-center p-3 rounded-xl hover:bg-gray-100 transition">
      <span className="text-2xl">🚌</span>
      <span className="text-sm mt-1 text-gray-600">
        {i18nText("ui.literals.kdc5eb704bbca")}
      </span>
    </button>
  );
}