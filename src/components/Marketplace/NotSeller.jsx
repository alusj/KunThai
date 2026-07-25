import { useI18n } from "../../i18n";

export default function NotSeller() {
  const { t } = useI18n();
  return (
    <div className="p-6 text-center text-gray-600">
      {/* Guard screen: user is not a seller */}
      <p className="text-lg font-medium">
        {t("urmall.guard.notSeller")}
      </p>
      <p className="mt-2 text-sm">
        {t("urmall.guard.notSellerHint")}
      </p>
    </div>
  );
}
