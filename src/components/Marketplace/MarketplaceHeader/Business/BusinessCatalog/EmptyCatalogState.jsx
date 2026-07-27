import { useI18n, t } from "../../../../../i18n";

export default function EmptyCatalogState({ title, description }) {
  useI18n();
  return (
    <div className="rounded-xl border bg-gray-50 p-6 text-center">
      <p className="font-medium">{title ?? t("urmall.biz.cat.emptyDefaultT")}</p>
      <p className="text-sm text-gray-600">{description ?? t("urmall.biz.cat.emptyDefaultD")}</p>
    </div>
  );
}
