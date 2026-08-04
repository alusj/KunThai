import BackTab from "./BackTab";
import { useI18n, t } from "../../../../i18n";

export default function TransactionsHeader({ setActiveScreen }) {
  useI18n();
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b bg-white">

      {/* Back Button */}
      <BackTab onBack={() => setActiveScreen("dashboard")} />

      {/* Title */}
      <h1 className="text-lg font-bold">
        {t("urride.header.transactionsHistory")}
      </h1>

      {/* Empty spacing for balance */}
      <div className="w-6"></div>
    </div>
  );
}
