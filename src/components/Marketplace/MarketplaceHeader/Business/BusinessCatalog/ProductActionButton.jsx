export default function ProductActionButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-800 transition hover:bg-gray-50 sm:w-auto"
    >
      {label}
    </button>
  );
}
