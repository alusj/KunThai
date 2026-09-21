
import { t as i18nText } from "../../../../../i18n/index";
import { useI18n as useUiLocale } from "../../../../../i18n/index.js";// src/explore/connections/myCircle/MyCircleEmpty.jsx
export default function MyCircleEmpty() {
  useUiLocale();
  return (
    <div className="text-center text-gray-500 mt-10">
      {i18nText("ui.literals.kd5bd6ccb642e")}
    </div>
  );
}
