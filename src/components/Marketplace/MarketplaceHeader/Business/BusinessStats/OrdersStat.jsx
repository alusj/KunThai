// src/components/Marketplace/MarketplaceHeader/Business/BusinessStats/OrdersStat.jsx

import { useI18n, t } from "../../../../../i18n";
import StatCard from "./StatCard";

/**
 * Orders statistics
 */

export default function OrdersStat() {
  useI18n();
  return (
    <StatCard
      icon="🧾"
      label={t("urmall.biz.stats.orders")}
      value={112}
    />
  );
}
