import { useI18n } from "../../../../../i18n";
import BackTab from "./BackTab";

export default function SellerHeaderTitle({ onBack }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BackTab onBack={onBack} />
      <div className="hidden h-6 w-px bg-gray-200 sm:block" />
      <span className="hidden truncate text-sm font-semibold text-gray-900 sm:block">
        {t("urmall.biz.header.sellerDashboard")}
      </span>
    </div>
  );
}
