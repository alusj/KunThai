// src/components/Marketplace/MarketplaceHeader/Business/BusinessStats/StatCard.jsx

/**
 * Reusable statistic card
 * - Handles layout & styling only
 * - Receives data via props
 */

export default function StatCard({ icon, label, value }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm">
      
      {/* Icon */}
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">
        {icon}
      </div>

      {/* Text content */}
      <div>
        <p className="text-sm text-gray-500">
          {label}
        </p>
        <p className="text-xl font-semibold text-gray-900">
          {value}
        </p>
      </div>

    </div>
  );
}
