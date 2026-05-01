import OrderStatusCard from "./OrderStatusCard";

export default function OrderStatusGrid({ orders }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-black text-gray-950">Order Status</h3>
        <p className="text-sm font-medium text-gray-500">
          Track what is waiting, completed, cancelled, or refunded.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <OrderStatusCard label="Total" value={orders.total} />
        <OrderStatusCard label="Pending" value={orders.pending} tone="amber" />
        <OrderStatusCard label="Completed" value={orders.completed} tone="green" />
        <OrderStatusCard label="Cancelled" value={orders.cancelled} tone="red" />
        <OrderStatusCard label="Refunded" value={orders.refunded} tone="red" />
      </div>
    </section>
  );
}
