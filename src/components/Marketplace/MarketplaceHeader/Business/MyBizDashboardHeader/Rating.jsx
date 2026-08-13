
import { t as i18nText } from "../../../../../i18n/index";// src/components/Marketplace/Business/MyBizDashboardHeader/Rating.jsx

export default function Rating() {
  return (
    <div className="flex items-center gap-1 mt-1">
      <span className="text-yellow-500 text-sm">★</span>

      <span className="text-sm font-medium text-gray-800">
        4.6
      </span>

      <span className="text-sm text-gray-500">
        {i18nText("ui.literals.kf20925a0e6e3")}
      </span>
    </div>
  );
}
