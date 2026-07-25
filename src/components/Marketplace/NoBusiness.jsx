import { useI18n } from "../../i18n";

export default function NoBusiness() {
  const { t } = useI18n();
  return (
    <div className="p-6 text-center text-gray-600">
      {/* Guard screen: seller has no business */}
      <p className="text-lg font-medium">
        {t("urmall.guard.noBusiness")}
      </p>
      <p className="mt-2 text-sm">
        {t("urmall.guard.noBusinessHint")}
      </p>
    </div>
  );
}
