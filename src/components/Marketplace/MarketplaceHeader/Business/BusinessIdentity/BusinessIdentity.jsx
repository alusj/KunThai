// src/components/Marketplace/MarketplaceHeader/Business/BusinessIdentity/BusinessIdentity.jsx

import BusinessStatus from "./BusinessStatus";
import EditBusinessButton from "./EditBusinessButton";

/**
 * BusinessIdentity
 * ----------------
 * Displays core identity information about the business.
 * This file ONLY handles layout and composition.
 */

export default function BusinessIdentity() {
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm space-y-3">

      {/* Top row: Name + status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Jay Electronics
          </h2>

          <p className="text-sm text-gray-500">
            Electronics · Sierra Leone
          </p>
        </div>

        <BusinessStatus status="open" />
      </div>

      {/* Action row */}
      <EditBusinessButton />

    </section>
  );
}
