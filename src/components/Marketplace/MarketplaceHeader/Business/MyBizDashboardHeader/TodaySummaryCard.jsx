import { AlertTriangle, MessageSquare, PackageCheck, Wallet } from "lucide-react";
import { useState } from "react";

import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import { useI18n, t } from "../../../../../i18n";
import TodayMetric from "./TodayMetric";
import TodaySummaryPanel from "./TodaySummaryPanel";

export default function TodaySummaryCard({ today }) {
  useI18n();
  const [activeKey, setActiveKey] = useState("orders");
  const items = [
      {
        key: "orders",
        icon: PackageCheck,
        label: today.orderMetricLabel || t("urmall.biz.dash.orders"),
        value: today.orders || 0,
        title: t("urmall.biz.dash.todaysX", { label: String(today.orderMetricLabel || t("urmall.biz.dash.orders")).toLowerCase() }),
        description: today.orderDescription || t("urmall.biz.dash.ordersDesc"),
        rows: today.details?.orders || [],
        tone: "blue",
      },
      {
        key: "revenue",
        icon: Wallet,
        label: t("urmall.biz.dash.revenue"),
        value: formatCurrency(today.revenue || 0),
        title: t("urmall.biz.stats.todayRevenue"),
        description: t("urmall.biz.dash.revenueDesc"),
        rows: today.details?.revenue || [],
        tone: "green",
        money: true,
      },
      {
        key: "messages",
        icon: MessageSquare,
        label: t("urmall.biz.dash.messages"),
        value: today.pendingMessages || 0,
        title: t("urmall.biz.dash.unreadMessages"),
        description: t("urmall.biz.dash.messagesDesc"),
        rows: today.details?.messages || [],
        tone: "gray",
      },
      {
        key: "lowStock",
        icon: AlertTriangle,
        label: t("urmall.biz.dash.lowStock"),
        value: today.lowStockAlerts || 0,
        title: t("urmall.biz.dash.lowStockProducts"),
        description: t("urmall.biz.dash.lowStockDesc"),
        rows: today.details?.lowStock || [],
        tone: "amber",
      },
  ];
  const activeItem = items.find((item) => item.key === activeKey) || items[0];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-gray-950">{t("urmall.biz.dash.todaySummary")}</h3>
          <p className="text-sm font-medium text-gray-500">
            {t("urmall.biz.dash.liveSnapshot")}
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

      <div key={activeItem.key} className="kt-seller-detail-swap mt-4">
        <TodaySummaryPanel item={activeItem} />
      </div>
    </section>
  );
}
