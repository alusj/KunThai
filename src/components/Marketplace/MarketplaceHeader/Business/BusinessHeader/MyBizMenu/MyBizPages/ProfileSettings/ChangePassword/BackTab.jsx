import AppBackTab from "../../../../../../../../shared/AppBackTab.jsx";
import { useI18n } from "../../../../../../../../../i18n";

export default function BackTab({ onBack }) {
  const { t } = useI18n();
  return (
    <AppBackTab
      onBack={onBack}
      label={t("common.back")}
      historyKey="marketplace-menu-back"
      className="mt-0.5 flex-none"
      useHistoryLayer={false}
    />
  );
}
