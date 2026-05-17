import { ShoppingBag } from "lucide-react";
import { useState } from "react";

import { useSellerSales } from "../../../../../Backend/hooks/useSellerSales";
import { updateSellerOrderStatus } from "../../../../../Backend/services/marketplace/sellerSalesService";
import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import BestSalesWindowCard from "./BestSalesWindowCard";
import OrderStatusGrid from "./OrderStatusGrid";
import RevenueMetrics from "./RevenueMetrics";
import SalesMetricCard from "./SalesMetricCard";

export default function BusinessStats({ initialView = "revenue" }) {
  const { revenue, orders, averageOrderValue, bestSalesWindow, recentOrders, loading } = useSellerSales();
  const [activeView, setActiveView] = useState(initialView);
  const [localOrders, setLocalOrders] = useState([]);
  const [feedback, setFeedback] = useState("");

  if (loading || !revenue || !orders || !bestSalesWindow) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-busy="true">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </section>
    );
  }

  const visibleOrders = localOrders.length ? localOrders : recentOrders;

  async function changeOrderStatus(order, status) {
    try {
      await updateSellerOrderStatus(order.id, status);
      setLocalOrders((current) => {
        const source = current.length ? current : recentOrders;
        return source.map((item) => (item.id === order.id ? { ...item, status } : item));
      });
      setFeedback("Order status updated.");
    } catch (err) {
      setFeedback(err.message || "Unable to update order.");
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-black text-gray-950">Sales & Orders</h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          Revenue, order flow, and the selling times that matter most.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { id: "revenue", label: "Revenue" },
            { id: "orders", label: "Order Status" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              className={`rounded-lg px-4 py-3 text-sm font-black transition ${
                activeView === item.id
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {activeView === "revenue" ? (
        <>
          <RevenueMetrics revenue={revenue} />

          <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
            <SalesMetricCard
              icon={ShoppingBag}
              label="Average order value"
              value={formatCurrency(averageOrderValue)}
              helper="Average amount buyers spend per order"
            />
            <BestSalesWindowCard window={bestSalesWindow} />
          </div>
        </>
      ) : null}

      {feedback ? <p className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{feedback}</p> : null}

      {activeView === "orders" ? (
        <div className="space-y-4">
          <OrderStatusGrid orders={orders} />
          <SellerOrderQueue orders={visibleOrders} onStatusChange={changeOrderStatus} />
        </div>
      ) : null}
    </section>
  );
}

function SellerOrderQueue({ orders = [], onStatusChange }) {
  if (!orders.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
        <p className="font-black text-gray-950">No seller orders yet</p>
        <p className="mt-1 text-sm font-semibold text-gray-500">New buyer orders will appear here for review and fulfillment.</p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-black text-gray-950">Seller order queue</h4>
          <p className="mt-1 text-sm font-semibold text-gray-500">Review, pack, complete, or cancel buyer orders.</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {orders.map((order) => (
          <article key={order.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black text-gray-950">{order.preview}</p>
                <p className="mt-1 text-xs font-bold text-gray-500">{order.buyerName} | {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
                {order.deliveryLocation ? <p className="mt-2 line-clamp-2 text-xs font-semibold text-gray-500">{order.deliveryLocation}</p> : null}
              </div>
              <div className="text-right">
                <p className="text-base font-black text-gray-950">{formatCurrency(order.totalAmount)}</p>
                <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-black capitalize text-amber-700">{order.status}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => onStatusChange?.(order, "shipped")} className="h-10 rounded-lg bg-blue-50 text-xs font-black text-blue-700 hover:bg-blue-100">
                Mark shipped
              </button>
              <button type="button" onClick={() => onStatusChange?.(order, "completed")} className="h-10 rounded-lg bg-emerald-600 text-xs font-black text-white hover:bg-emerald-700">
                Complete
              </button>
              <button type="button" onClick={() => onStatusChange?.(order, "cancelled")} className="h-10 rounded-lg bg-red-50 text-xs font-black text-red-700 hover:bg-red-100">
                Cancel
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
