export default function EditBusinessButton({ onClick }) {
  return (
    <button
      type="button"
      className="w-full rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={typeof onClick !== "function"}
      onClick={onClick}
    >
      Edit Business Profile
    </button>
  );
}
