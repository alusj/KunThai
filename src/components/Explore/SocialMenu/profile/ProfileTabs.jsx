import { useI18n } from "../../../../i18n";
import { uiText as translateUi } from "../../../../i18n/index.js";

export default function ProfileTabs({ active, editable, onChange }) {
  const { t } = useI18n();
  const tabs = [
    { id: "feed", label: t("profile.tabFeed") },
    { id: "swip", label: "Swip" },
    ...(editable
      ? [
          { id: "saved", label: t("profile.tabSaved") },
          { id: "activity", label: t("profile.tabActivity") },
        ]
      : []),
  ];

  return (
    <div className="flex overflow-x-auto border-b border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`-mb-px h-11 flex-1 whitespace-nowrap border-b-2 px-3 text-sm transition ${
            active === tab.id ? "border-slate-950 font-black text-slate-950" : "border-transparent font-semibold text-slate-500"
          }`}
        >
          {translateUi(tab.label)}
        </button>
      ))}
    </div>
  );
}
