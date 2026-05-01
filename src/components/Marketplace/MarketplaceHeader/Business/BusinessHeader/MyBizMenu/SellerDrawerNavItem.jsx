import { ChevronRight } from "lucide-react";

export default function SellerDrawerNavItem({
  icon: Icon,
  title,
  description,
  badge,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800">
        <Icon size={20} strokeWidth={2.2} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-gray-950">
          {title}
        </span>
        <span className="mt-0.5 block line-clamp-2 text-xs font-semibold leading-5 text-gray-500">
          {description}
        </span>
      </span>

      {badge ? (
        <span className="shrink-0 rounded-full bg-red-50 px-2 py-1 text-xs font-black text-red-600">
          {badge}
        </span>
      ) : null}

      <ChevronRight className="shrink-0 text-gray-400" size={18} />
    </button>
  );
}
