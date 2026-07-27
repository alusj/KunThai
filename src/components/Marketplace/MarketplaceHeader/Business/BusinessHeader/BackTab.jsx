import AppBackTab from "../../../../shared/AppBackTab";
import { useI18n } from "../../../../../i18n";

export default function BackTab({ onBack }) {
  const { t } = useI18n();
  return (
    <AppBackTab
      onBack={onBack}
      label={t("common.back")}
      historyKey="marketplace-business-header"
      className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
      useHistoryLayer={false}
    />
  );
}
