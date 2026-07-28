import { useI18n, t } from "../../../../../i18n";
import OrderStatusCard from "./OrderStatusCard";

export default function OrderStatusGrid({ orders }) {
  useI18n();
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-black text-gray-950">{t("urmall.biz.stats.tabOrderStatus")}</h3>
        <p className="text-sm font-medium text-gray-500">
          {t("urmall.biz.stats.orderStatusDesc")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <OrderStatusCard label={t("urmall.biz.stats.total")} value={orders.total} />
        <OrderStatusCard label={t("urmall.biz.stats.pending")} value={orders.pending} tone="amber" />
        <OrderStatusCard label={t("urmall.biz.stats.completed")} value={orders.completed} tone="green" />
        <OrderStatusCard label={t("urmall.biz.stats.cancelled")} value={orders.cancelled} tone="red" />
        <OrderStatusCard label={t("urmall.biz.stats.refunded")} value={orders.refunded} tone="red" />
      </div>
    </section>
  );
}
