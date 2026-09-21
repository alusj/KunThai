// src/components/Marketplace/MarketplaceHeader/Business/BusinessInsights/EngagementInsight.jsx

import InsightItem from "./InsightItem";
import { t as i18nText } from "../../../../../i18n/index";
import { useI18n as useUiLocale } from "../../../../../i18n/index.js";

/**
 * EngagementInsight
 * -----------------
 * Shows how customers interact with the business.
 */

export default function EngagementInsight() {
  useUiLocale();
  return (
    <InsightItem
      icon="💬"
      title={i18nText("ui.literals.k9e52e75878bf")}
      value="24 interactions"
      description={i18nText("ui.literals.kbd923a4e7407")}
    />
  );
}
