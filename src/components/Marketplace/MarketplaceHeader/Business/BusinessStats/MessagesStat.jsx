// src/components/Marketplace/MarketplaceHeader/Business/BusinessStats/MessagesStat.jsx

import { useI18n, t } from "../../../../../i18n";
import StatCard from "./StatCard";

/**
 * Messages statistics
 */

export default function MessagesStat() {
  useI18n();
  return (
    <StatCard
      icon="💬"
      label={t("urmall.biz.stats.messages")}
      value={8}
    />
  );
}
