// src/components/Marketplace/MarketplaceHeader/Business/BusinessInsights/BusinessInsights.jsx

import SalesTrend from "./SalesTrend";
import EngagementInsight from "./EngagementInsight";

/**
 * BusinessInsights
 * ----------------
 * High-level insights about business performance.
 * This file ONLY controls layout.
 */

export default function BusinessInsights() {
  return (
    <section className="space-y-4">
      
      <h3 className="text-lg font-semibold text-gray-800">
        Business Insights
      </h3>

      <div className="grid grid-cols-1 gap-4">
        <SalesTrend />
        <EngagementInsight />
      </div>

    </section>
  );
}
