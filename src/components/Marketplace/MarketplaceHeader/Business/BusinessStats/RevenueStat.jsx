// src/components/Marketplace/MarketplaceHeader/Business/BusinessStats/RevenueStat.jsx

import { useI18n, t } from "../../../../../i18n";
import StatCard from "./StatCard";

/**
 * Revenue statistics
 */

export default function RevenueStat() {
  useI18n();
  return (
    <StatCard
      icon="💰"
      label={t("urmall.biz.stats.revenue")}
      value="$3,420"
    />
  );
}
