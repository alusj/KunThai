// src/components/Marketplace/MarketplaceHeader/Business/BusinessInsights/SalesTrend.jsx

import InsightItem from "./InsightItem";

/**
 * SalesTrend
 * ----------
 * Shows revenue or sales performance.
 * Can later connect to charts or Supabase.
 */

export default function SalesTrend() {
  return (
    <InsightItem
      icon="📈"
      title="Sales Trend"
      value="+18%"
      description="Sales increased compared to last week"
    />
  );
}
