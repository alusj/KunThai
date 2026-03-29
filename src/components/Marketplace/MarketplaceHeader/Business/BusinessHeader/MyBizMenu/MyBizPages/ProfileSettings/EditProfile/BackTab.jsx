export default function BackTab({ onBack }) {
  return (
    <button
      onClick={onBack}
      className="text-sm font-medium text-gray-700 hover:text-gray-900 transition"
    >
      Back
    </button>
  );
}
