// src/components/Marketplace/MarketplaceHeader/Business/BusinessStats/ProductsStat.jsx

import StatCard from "./StatCard";

/**
 * Products statistics
 * - Uses StatCard
 * - Supplies products data only
 */

export default function ProductsStat() {
  return (
    <StatCard
      icon="📦"
      label="Products"
      value={24}
    />
  );
}
