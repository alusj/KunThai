import { ArrowLeft, X } from "lucide-react";

export default function MenuHeader({ title, showBack, onBack, onClose }) {
  return (
    <div className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4">
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
          aria-label="Back to menu"
          title="Back"
        >
          <ArrowLeft size={19} strokeWidth={2.3} />
        </button>
      ) : (
        <div className="h-10 w-10" />
      )}

      <h2 className="min-w-0 flex-1 truncate px-3 text-center text-base font-bold text-gray-950">
        {title}
      </h2>

      <button
        type="button"
        onClick={onClose}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
        aria-label="Close menu"
        title="Close"
      >
        <X size={20} strokeWidth={2.3} />
      </button>
    </div>
  );
}
