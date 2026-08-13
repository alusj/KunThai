import { useI18n } from "../../../../i18n";

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
    <div className="flex gap-2 overflow-x-auto rounded-[24px] border border-slate-200 bg-white p-2 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`h-10 flex-1 rounded-2xl px-4 text-sm font-semibold transition ${
            active === tab.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
