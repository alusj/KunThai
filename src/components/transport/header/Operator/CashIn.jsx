import { useI18n, t } from "../../../../i18n";

export default function CashIn() {
  useI18n();
  return (
    <div className="text-center text-gray-500 mt-10">
      {t("urride.header.noCashIn")}
    </div>
  );
}
