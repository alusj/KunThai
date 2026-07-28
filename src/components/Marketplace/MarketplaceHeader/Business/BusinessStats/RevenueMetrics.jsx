import { Banknote, CalendarDays, Wallet } from "lucide-react";

import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import { useI18n, t } from "../../../../../i18n";
import SalesMetricCard from "./SalesMetricCard";

export default function RevenueMetrics({ revenue }) {
  useI18n();
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <SalesMetricCard
        icon={Wallet}
        label={t("urmall.biz.stats.todayRevenue")}
        value={formatCurrency(revenue.today)}
        helper={t("urmall.biz.stats.todayHelper")}
        tone="green"
      />
      <SalesMetricCard
        icon={CalendarDays}
        label={t("urmall.biz.stats.weeklyRevenue")}
        value={formatCurrency(revenue.weekly)}
        helper={t("urmall.biz.stats.weeklyHelper")}
        tone="blue"
      />
      <SalesMetricCard
        icon={Banknote}
        label={t("urmall.biz.stats.monthlyRevenue")}
        value={formatCurrency(revenue.monthly)}
        helper={t("urmall.biz.stats.monthlyHelper")}
        tone="purple"
      />
    </div>
  );
}
