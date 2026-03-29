// src/components/Marketplace/MarketplaceHeader/Business/BusinessStats/MessagesStat.jsx

import StatCard from "./StatCard";

/**
 * Messages statistics
 */

export default function MessagesStat() {
  return (
    <StatCard
      icon="💬"
      label="Messages"
      value={8}
    />
  );
}
