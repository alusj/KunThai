// src/components/Marketplace/MarketplaceHeader/Business/BusinessInsights/SalesTrend.jsx

import InsightItem from "./InsightItem";
import { t as i18nText } from "../../../../../i18n/index";

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
      title={i18nText("ui.literals.k9644346d2301")}
      value="+18%"
      description={i18nText("ui.literals.kf8bf9202ce39")}
    />
  );
}
