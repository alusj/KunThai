// src/components/Marketplace/MarketplaceHeader/Business/BusinessActions/ActionButton.jsx

/**
 * Generic action button
 * - Handles layout & styling only
 * - Receives icon, label and click handler
 */

export default function ActionButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="
        flex items-center gap-3
        rounded-xl border
        bg-white p-4
        text-left
        shadow-sm
        transition
        hover:bg-gray-50
        active:scale-[0.98]
      "
    >
      {/* Icon */}
      <div className="text-xl">
        {icon}
      </div>

      {/* Label */}
      <span className="font-medium text-gray-800">
        {label}
      </span>
    </button>
  );
}
