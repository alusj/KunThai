export default function FleetOptionButton({ icon, label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="
        flex min-h-16 flex-col items-center justify-center
        rounded-2xl border border-gray-200 bg-gray-50 p-3
        hover:border-green-300 hover:bg-green-50 hover:shadow-md
        transition-all
      "
    >
      <span className="flex h-7 items-center text-2xl leading-none">{icon}</span>
      <span className="mt-1 text-xs font-semibold text-gray-600">{label}</span>
    </button>
  );
}
