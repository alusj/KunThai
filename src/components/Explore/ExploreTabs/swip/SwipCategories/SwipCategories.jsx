import { SWIP_CATEGORIES } from "../videos/swipUtils";

export default function SwipCategories({ active, setActive }) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="flex w-full gap-2 overflow-x-auto px-3 pt-3 sm:grid sm:grid-cols-6 sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SWIP_CATEGORIES.map((item) => {
          const isActive = active === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`
                relative inline-flex flex-none items-center justify-center px-4 pb-3 pt-2 text-sm font-medium transition sm:w-full sm:min-w-0 sm:px-2
                ${
                  isActive
                    ? "text-sky-700 after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-sky-700"
                    : "text-slate-600 hover:text-slate-900"
                }
              `}
            >
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
