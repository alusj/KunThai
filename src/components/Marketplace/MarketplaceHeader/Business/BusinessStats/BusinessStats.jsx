import { ShoppingBag } from "lucide-react";
import { useState } from "react";

import { useSellerSales } from "../../../../../Backend/hooks/useSellerSales";
import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import BestSalesWindowCard from "./BestSalesWindowCard";
import OrderStatusGrid from "./OrderStatusGrid";
import RevenueMetrics from "./RevenueMetrics";
import SalesMetricCard from "./SalesMetricCard";

export default function BusinessStats() {
  const { revenue, orders, averageOrderValue, bestSalesWindow, loading } = useSellerSales();
  const [activeView, setActiveView] = useState("revenue");

  if (loading || !revenue || !orders || !bestSalesWindow) {
    return <div className="h-64 rounded-xl bg-white shadow-sm" />;
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

      {activeView === "orders" ? <OrderStatusGrid orders={orders} /> : null}
    </section>
  );
}
