import { AlertTriangle, MessageSquare, PackageCheck, Wallet } from "lucide-react";

import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import TodayMetric from "./TodayMetric";

export default function TodaySummaryCard({ today }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-gray-950">Today Summary</h3>
          <p className="text-sm font-medium text-gray-500">
            Live snapshot for your store
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TodayMetric
          icon={PackageCheck}
          label="Orders"
          value={today.orders}
          tone="blue"
        />
        <TodayMetric
          icon={Wallet}
          label="Revenue"
          value={formatCurrency(today.revenue)}
          tone="green"
        />
        <TodayMetric
          icon={MessageSquare}
          label="Messages"
          value={today.pendingMessages}
          tone="gray"
        />
        <TodayMetric
          icon={AlertTriangle}
          label="Low Stock"
          value={today.lowStockAlerts}
          tone="amber"
        />
      </div>
    </section>
  );
}
