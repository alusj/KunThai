// src/components/Marketplace/MarketplaceHeader/Business/BusinessStats/BusinessStats.jsx

/**
 * Business dashboard statistics section
 * - Composes individual stat components
 * - Handles layout only
 */

import ProductsStat from "./ProductsStat";
import OrdersStat from "./OrdersStat";
import RevenueStat from "./RevenueStat";
import MessagesStat from "./MessagesStat";

export default function BusinessStats() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">

      <ProductsStat />
      <OrdersStat />
      <RevenueStat />
      <MessagesStat />

    </div>
  );
}
