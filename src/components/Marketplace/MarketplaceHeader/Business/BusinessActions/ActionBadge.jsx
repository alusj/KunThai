// src/components/Marketplace/MarketplaceHeader/Business/BusinessActions/ActionBadge.jsx

/**
 * ActionBadge
 * - Small numeric indicator for unread items
 */

export default function ActionBadge({ value }) {
  if (!value) return null;

  return (
    <span className="
      absolute -top-2 -right-2
      flex h-6 w-6 items-center justify-center
      rounded-full
      bg-red-500
      text-xs font-bold text-white
    ">
      {value}
    </span>
  );
}
