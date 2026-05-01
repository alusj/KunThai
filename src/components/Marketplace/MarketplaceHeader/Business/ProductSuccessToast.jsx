export default function ProductSuccessToast({ message, onClose }) {
  if (!message) return null;

  return (
    <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-emerald-700">{message}</p>
          <p className="mt-1 text-sm font-medium text-gray-500">
            Your store and catalog have been updated.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-sm font-black text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          aria-label="Close"
        >
          x
        </button>
      </div>
    </div>
  );
}
