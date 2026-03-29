// src/components/Marketplace/MarketplaceHeader/Business/BusinessInsights/EngagementInsight.jsx

import InsightItem from "./InsightItem";

/**
 * EngagementInsight
 * -----------------
 * Shows how customers interact with the business.
 */

export default function EngagementInsight() {
  return (
    <InsightItem
      icon="💬"
      title="Customer Engagement"
      value="24 interactions"
      description="Messages, views, and profile visits"
    />
  );
}
