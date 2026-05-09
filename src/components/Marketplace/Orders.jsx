import { useEffect, useState } from "react";
import { MapPin, PackageCheck, ReceiptText } from "lucide-react";
import { formatCurrency } from "../../Backend/utils/formatCurrency";
import { fetchBuyerOrders } from "../../Backend/services/marketplace/buyerMarketplaceService";
import AppBackButton from "../shared/AppBackButton";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusTone(status) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  if (status === "shipped") return "bg-blue-50 text-blue-700";
  return "bg-amber-50 text-amber-700";
}

export default function Orders({ onBack }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadOrders() {
      setLoading(true);
      setError("");

      try {
        const rows = await fetchBuyerOrders();
        if (alive) setOrders(rows);
      } catch (err) {
        if (alive) setError(err.message || "Unable to load orders.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadOrders();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-white px-4">
        <AppBackButton onBack={onBack} label="Back to marketplace" historyKey="marketplace-orders" />
        <div>
          <h1 className="text-lg font-black text-gray-950">Orders</h1>
          <p className="text-xs font-bold text-gray-500">Your marketplace purchases and checkout requests</p>
        </div>
      </header>

      <section className="mx-auto max-w-4xl space-y-3 p-4">
        {error && <p className="rounded-lg bg-red-50 p-4 font-bold text-red-700">{error}</p>}

        {!loading && !error && !orders.length && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <ReceiptText className="mx-auto text-gray-400" size={36} />
            <p className="mt-3 font-black text-gray-950">No orders yet</p>
            <p className="mt-1 text-sm font-medium text-gray-500">Checkout orders will appear here with seller, amount, and status.</p>
          </div>
        )}

        {orders.map((order) => (
          <article key={order.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  {order.sellerLogoUrl ? (
                    <img src={order.sellerLogoUrl} alt="" className="h-full w-full rounded-lg object-cover" />
                  ) : (
                    <PackageCheck size={22} />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-black text-gray-950">{order.sellerName}</h2>
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-gray-500">
                    <MapPin size={13} />
                    {order.sellerLocation || order.deliveryLocation || "Location not added"}
                  </p>
                </div>
              </div>
              <span className={`rounded-lg px-2.5 py-1 text-xs font-black capitalize ${statusTone(order.status)}`}>
                {order.status}
              </span>
            </div>

            <div className="mt-4 rounded-lg bg-gray-50 p-3">
              <p className="text-sm font-bold text-gray-700">{order.preview || "Marketplace order"}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-gray-500">
                  {order.itemCount} item{order.itemCount === 1 ? "" : "s"} • {formatDate(order.createdAt)}
                </p>
                <p className="text-lg font-black text-gray-950">{formatCurrency(order.totalAmount)}</p>
              </div>
            </div>

            {order.deliveryLocation && (
              <p className="mt-3 text-xs font-bold text-gray-500">Delivery note: {order.deliveryLocation}</p>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
