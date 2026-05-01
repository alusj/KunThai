import { AlertTriangle, MessageSquare, PackageCheck, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import TodayMetric from "./TodayMetric";
import TodaySummaryPanel from "./TodaySummaryPanel";

export default function TodaySummaryCard({ today }) {
  const [activeKey, setActiveKey] = useState("orders");
  const items = useMemo(
    () => [
      {
        key: "orders",
        icon: PackageCheck,
        label: "Orders",
        value: today.orders || 0,
        title: "Today's orders",
        description: "Orders created today, including pending and completed orders.",
        rows: today.details?.orders || [],
        tone: "blue",
      },
      {
        key: "revenue",
        icon: Wallet,
        label: "Revenue",
        value: formatCurrency(today.revenue || 0),
        title: "Today's revenue",
        description: "Money from completed orders today.",
        rows: today.details?.revenue || [],
        tone: "green",
        money: true,
      },
      {
        key: "messages",
        icon: MessageSquare,
        label: "Messages",
        value: today.pendingMessages || 0,
        title: "Unread buyer messages",
        description: "Messages waiting for a seller response.",
        rows: today.details?.messages || [],
        tone: "gray",
      },
      {
        key: "lowStock",
        icon: AlertTriangle,
        label: "Low Stock",
        value: today.lowStockAlerts || 0,
        title: "Low stock products",
        description: "Active products at or below their low-stock alert level.",
        rows: today.details?.lowStock || [],
        tone: "amber",
      },
    ],
    [today],
  );
  const activeItem = items.find((item) => item.key === activeKey) || items[0];

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

      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <TodayMetric
            key={item.key}
            icon={item.icon}
            label={item.label}
            value={item.value}
            tone={item.tone}
            active={activeItem.key === item.key}
            onClick={() => setActiveKey(item.key)}
          />
        ))}
      </div>

      <div className="mt-4">
        <TodaySummaryPanel item={activeItem} />
      </div>
    </section>
  );
}
