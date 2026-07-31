// Logo.jsx
import { useI18n, t } from "../../../../../i18n";

export default function Logo() {
  useI18n();
  return (
    <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium">
      {t("urmall.biz.dash.logo")}
    </div>
  );
}
