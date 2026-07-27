import AppBackTab from "../../../../../shared/AppBackTab";
import { useI18n, t } from "../../../../../../i18n";

export default function MenuHeader({ title, eyebrow = "UrMall", onBack, label = t("urmall.biz.menu.backToDashboard") }) {
  useI18n();
  return (
    <div className="kt-header-glass flex h-16 items-center gap-3 px-3 sm:px-4">
      <AppBackTab
        onBack={onBack}
        label={label}
        historyKey="marketplace-business-menu"
        useHistoryLayer={false}
      />
      <div className="min-w-0">
        <p className="text-xs font-black uppercase text-emerald-700">{eyebrow}</p>
        <h2 className="truncate text-lg font-black text-gray-950">{title}</h2>
      </div>
    </div>
  );
}
