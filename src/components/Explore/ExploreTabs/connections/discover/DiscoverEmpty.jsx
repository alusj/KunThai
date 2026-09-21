
import { t as i18nText } from "../../../../../i18n/index";
import { useI18n as useUiLocale } from "../../../../../i18n/index.js";// src/explore/connections/discover/DiscoverEmpty.jsx
export default function DiscoverEmpty() {
  useUiLocale();
  return (
    <div className="text-center text-gray-500 mt-10">
      {i18nText("ui.literals.kbeb87ece1c65")}
    </div>
  );
}
