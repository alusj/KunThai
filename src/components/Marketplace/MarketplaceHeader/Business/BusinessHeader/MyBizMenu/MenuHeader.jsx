export default function MenuHeader({
  title,
  showBack,
  onBack,
  onClose
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b">

      {/* Back */}
      {showBack ? (
        <button
          onClick={onBack}
          className="text-sm font-medium text-gray-700"
        >
          ← Back
        </button>
      ) : (
        <div />
      )}

      {/* Dynamic Title */}
      <h2 className="text-sm font-semibold truncate">
        {title}
      </h2>

      {/* Close */}
      <button
        onClick={onClose}
        className="text-lg font-bold"
      >
        ×
      </button>
    </div>
  );
}
