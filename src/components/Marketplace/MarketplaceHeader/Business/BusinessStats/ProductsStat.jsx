// src/components/Marketplace/MarketplaceHeader/Business/BusinessStats/ProductsStat.jsx

import { useI18n, t } from "../../../../../i18n";
import StatCard from "./StatCard";

/**
 * Products statistics
 * - Uses StatCard
 * - Supplies products data only
 */

export default function ProductsStat() {
  useI18n();
  return (
    <StatCard
      icon="📦"
      label={t("urmall.biz.stats.products")}
      value={24}
    />
  );
}
