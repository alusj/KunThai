// BackTab.jsx
// Back button only (no layout, no title)

export default function BackTab({ onBack }) {
  return (
    <button
      onClick={onBack}
      className="text-sm font-medium text-gray-700 hover:text-gray-900"
    >
      ← Back
    </button>
  );
}
