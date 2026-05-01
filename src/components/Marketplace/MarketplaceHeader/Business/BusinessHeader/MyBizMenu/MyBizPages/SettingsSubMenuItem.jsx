import { ChevronRight } from "lucide-react";

export default function SettingsSubMenuItem({ icon: Icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:bg-gray-50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-800">
        <Icon size={18} strokeWidth={2.3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-gray-950">{title}</span>
        <span className="mt-0.5 block text-xs font-semibold leading-5 text-gray-500">
          {description}
        </span>
      </span>
      <ChevronRight className="shrink-0 text-gray-400" size={18} />
    </button>
  );
}
