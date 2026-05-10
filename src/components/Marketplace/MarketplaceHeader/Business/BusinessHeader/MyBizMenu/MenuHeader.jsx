import { X } from "lucide-react";
import AppBackTab from "../../../../../shared/AppBackTab";

export default function MenuHeader({ title, showBack, onBack, onClose }) {
  return (
    <div className="flex h-16 items-center justify-between border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
      {showBack ? (
        <AppBackTab
          onBack={onBack}
          label="Back to menu"
          historyKey="marketplace-business-menu"
          className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
        />
      ) : (
        <div className="h-10 w-10" />
      )}

      <h2 className="min-w-0 flex-1 truncate px-3 text-center text-base font-bold text-gray-950">
        {title}
      </h2>

      <button
        type="button"
        onClick={onClose}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50"
        aria-label="Close menu"
        title="Close"
      >
        <X size={20} strokeWidth={2.3} />
      </button>
    </div>
  );
}
