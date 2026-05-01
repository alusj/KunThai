export default function BackTab({ onBack }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="whitespace-nowrap text-sm font-semibold text-gray-700 transition hover:text-gray-900"
    >
      Back
    </button>
  );
}
