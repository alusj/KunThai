import { ShoppingBag } from "lucide-react";

import { useSellerSales } from "../../../../../Backend/hooks/useSellerSales";
import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import BestSalesWindowCard from "./BestSalesWindowCard";
import OrderStatusGrid from "./OrderStatusGrid";
import RevenueMetrics from "./RevenueMetrics";
import SalesMetricCard from "./SalesMetricCard";

export default function BusinessStats() {
  const { revenue, orders, averageOrderValue, bestSalesWindow, loading } = useSellerSales();

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

      <RevenueMetrics revenue={revenue} />

      <OrderStatusGrid orders={orders} />

      <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SalesMetricCard
          icon={ShoppingBag}
          label="Average order value"
          value={formatCurrency(averageOrderValue)}
          helper="Average amount buyers spend per order"
        />
        <BestSalesWindowCard window={bestSalesWindow} />
      </div>
    </section>
  );
}
