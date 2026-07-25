import { Grid2X2, Hotel, House, Store, UtensilsCrossed } from "lucide-react";

import { useI18n } from "../../i18n";

const parents = [
  { id: "all", labelKey: "urmall.parents.all", icon: Grid2X2 },
  { id: "shop", labelKey: "urmall.parents.shop", icon: Store },
  { id: "food", labelKey: "urmall.parents.food", icon: UtensilsCrossed },
  { id: "hotels", labelKey: "urmall.parents.hotels", icon: Hotel },
  { id: "property", labelKey: "urmall.parents.property", icon: House },
];

export default function MarketplaceParentNav({ active, onChange, enabledParents = ["shop", "food", "hotels", "property"] }) {
  const { t } = useI18n();
  const visibleParents = parents.filter((parent) => parent.id === "all" || enabledParents.includes(parent.id));

  return (
    <nav aria-label={t("urmall.parents.ariaLabel")} className="border-b border-gray-200 bg-white px-3 py-3 sm:px-6">
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visibleParents.map((parent) => {
          const Icon = parent.icon;
          const selected = active === parent.id;
          return (
            <button
              key={parent.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(parent.id)}
              className={`flex h-12 min-w-[104px] flex-1 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-black transition ${
                selected
                  ? parent.id === "all" ? "border-emerald-700 bg-emerald-700 text-white shadow-md" : "border-gray-950 bg-gray-950 text-white shadow-md"
                  : "border-gray-200 bg-gray-50 text-gray-600 hover:border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              <Icon size={18} /> {t(parent.labelKey)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
