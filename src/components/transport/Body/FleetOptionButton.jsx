export default function FleetOptionButton({ icon, label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="
        flex min-h-16 min-w-0 flex-col items-center justify-center
        rounded-2xl border border-gray-200 bg-gray-50 px-2 py-3
        hover:border-green-300 hover:bg-green-50 hover:shadow-md
        transition-all
      "
    >
      <span className="flex h-7 items-center text-2xl leading-none">{icon}</span>
      <span className="mt-1 max-w-full truncate text-[11px] font-semibold leading-tight text-gray-600 sm:text-xs">
        {label}
      </span>
    </button>
  );
}
