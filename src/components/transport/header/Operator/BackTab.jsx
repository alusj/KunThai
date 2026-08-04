import AppBackTab from "../../../shared/AppBackTab";
import { useI18n, t } from "../../../../i18n";

export default function BackTab({ onBack }) {
  useI18n();
  return (
    <AppBackTab
      onBack={onBack}
      label={t("urride.header.back")}
      historyKey="transport-operator-header"
      className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
    />
  );
}
