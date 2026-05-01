import { Banknote, CalendarDays, Wallet } from "lucide-react";

import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import SalesMetricCard from "./SalesMetricCard";

export default function RevenueMetrics({ revenue }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <SalesMetricCard
        icon={Wallet}
        label="Today's revenue"
        value={formatCurrency(revenue.today)}
        helper="Money earned today"
        tone="green"
      />
      <SalesMetricCard
        icon={CalendarDays}
        label="Weekly revenue"
        value={formatCurrency(revenue.weekly)}
        helper="Last 7 days"
        tone="blue"
      />
      <SalesMetricCard
        icon={Banknote}
        label="Monthly revenue"
        value={formatCurrency(revenue.monthly)}
        helper="Current month"
        tone="purple"
      />
    </div>
  );
}
