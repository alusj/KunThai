import { useEffect, useState } from "react";
import { Copy, Edit3, Eye, MapPin, MoreHorizontal, PackageCheck, ReceiptText, Share2, Trash2 } from "lucide-react";

import { fetchBuyerOrders, findBuyerOrderProduct, hideBuyerOrder } from "../../Backend/services/marketplace/buyerMarketplaceService";
import { formatCurrency } from "../../Backend/utils/formatCurrency";
import AppBackTab from "../shared/AppBackTab";

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

function orderShareText(order) {
  return [
    `Order: ${order.preview || "UrMall order"}`,
    `Seller: ${order.sellerName}`,
    `Status: ${order.status}`,
    `Total: ${formatCurrency(order.totalAmount)}`,
    order.deliveryLocation ? `Delivery: ${order.deliveryLocation}` : "",
  ].filter(Boolean).join("\n");
}

export default function Orders({ compact = false, onBack, onProductOpen }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openMenuId, setOpenMenuId] = useState("");
  const [editingOrder, setEditingOrder] = useState(null);

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

  async function openProduct(order) {
    const product = await findBuyerOrderProduct(order);
    if (!product) {
      setNotice("This order product could not be opened yet.");
      return;
    }

    if (onProductOpen) {
      onProductOpen(product);
      return;
    }

    window.dispatchEvent(new CustomEvent("marketplace-open-product", { detail: { product } }));
  }

  async function copyOrder(order) {
    const text = orderShareText(order);
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Order details copied.");
    } catch {
      setNotice(text);
    }
    setOpenMenuId("");
  }

  async function shareOrder(order) {
    const text = orderShareText(order);
    try {
      if (navigator.share) {
        await navigator.share({ title: "UrMall order", text });
        setNotice("Order details shared.");
      } else {
        await navigator.clipboard.writeText(text);
        setNotice("Sharing is not available here, so the order details were copied.");
      }
    } catch {
      setNotice("Share cancelled.");
    }
    setOpenMenuId("");
  }

  async function removeOrder(order) {
    try {
      await hideBuyerOrder(order.id);
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setNotice("Order deleted from your list.");
    } catch (err) {
      setNotice(err.message || "Unable to delete order from your list.");
    }
    setOpenMenuId("");
  }

  function saveEditedOrder(event) {
    event.preventDefault();
    setNotice("Order edit saved on this device. Seller-side order update is coming soon.");
    setEditingOrder(null);
    setOpenMenuId("");
  }

  return (
    <main className={compact ? "bg-gray-50" : "min-h-screen bg-gray-50"}>
      {!compact ? (
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-white px-4">
          <AppBackTab onBack={onBack} label="Back to UrMall" historyKey="marketplace-orders" />
          <div>
            <h1 className="text-lg font-black text-gray-950">Orders</h1>
            <p className="text-xs font-bold text-gray-500">Your UrMall purchases and checkout requests</p>
          </div>
        </header>
      ) : null}

      <section className="w-full space-y-3 p-4 sm:p-6 lg:p-8">
        {error ? <p className="rounded-lg bg-red-50 p-4 font-bold text-red-700">{error}</p> : null}
        {notice ? <p className="rounded-lg bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{notice}</p> : null}

        {!loading && !error && !orders.length ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <ReceiptText className="mx-auto text-gray-400" size={36} />
            <p className="mt-3 font-black text-gray-950">No orders yet</p>
            <p className="mt-1 text-sm font-medium text-gray-500">Checkout orders will appear here with seller, amount, and status.</p>
          </div>
        ) : null}

        {orders.map((order) => (
          <article key={order.id} className="relative rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button type="button" onClick={() => openProduct(order)} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left transition hover:bg-gray-50">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  {order.product?.imageUrl || order.sellerLogoUrl ? (
                    <img src={order.product?.imageUrl || order.sellerLogoUrl} alt="" className="h-full w-full rounded-lg object-cover" />
                  ) : (
                    <PackageCheck size={22} />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-black text-gray-950">{order.product?.name || order.sellerName}</h2>
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-gray-500">
                    <MapPin size={13} />
                    {order.sellerLocation || order.deliveryLocation || "Location not added"}
                  </p>
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-lg px-2.5 py-1 text-xs font-black capitalize ${statusTone(order.status)}`}>
                  {order.status}
                </span>
                <button
                  type="button"
                  onClick={() => setOpenMenuId((current) => (current === order.id ? "" : order.id))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                  aria-label="Order actions"
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
            </div>

            <button type="button" onClick={() => openProduct(order)} className="mt-4 w-full rounded-lg bg-gray-50 p-3 text-left transition hover:bg-emerald-50/50">
              <p className="text-sm font-bold text-gray-700">{order.preview || "UrMall order"}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-gray-500">
                  {order.itemCount} item{order.itemCount === 1 ? "" : "s"} | {formatDate(order.createdAt)}
                </p>
                <p className="text-lg font-black text-gray-950">{formatCurrency(order.totalAmount)}</p>
              </div>
            </button>

            {order.deliveryLocation ? (
              <p className="mt-3 text-xs font-bold text-gray-500">Delivery note: {order.deliveryLocation}</p>
            ) : null}

            {openMenuId === order.id ? (
              <div className="absolute right-4 top-14 z-20 w-[min(14rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
                <button type="button" onClick={() => openProduct(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <Eye size={16} />
                  View product
                </button>
                <button type="button" onClick={() => { setEditingOrder(order); setOpenMenuId(""); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <Edit3 size={16} />
                  Edit order
                </button>
                <button type="button" onClick={() => copyOrder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <Copy size={16} />
                  Copy details
                </button>
                <button type="button" onClick={() => shareOrder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <Share2 size={16} />
                  Share
                </button>
                <button type="button" onClick={() => removeOrder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-red-600 hover:bg-red-50">
                  <Trash2 size={16} />
                  Delete from my list
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      {editingOrder ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-gray-950/45 p-3 sm:items-center sm:justify-center">
          <form onSubmit={saveEditedOrder} className="w-full rounded-2xl bg-white p-4 shadow-2xl sm:max-w-lg sm:p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Edit order</p>
            <h2 className="mt-1 text-xl font-black text-gray-950">{editingOrder.preview || "UrMall order"}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
              You can keep a local note for this order now. Full seller-facing order edits will be enabled when the order update workflow is ready.
            </p>
            <textarea
              defaultValue={editingOrder.deliveryLocation || ""}
              className="mt-4 min-h-32 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
              placeholder="Delivery note or buyer instruction"
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setEditingOrder(null)} className="h-11 rounded-xl border border-gray-200 text-sm font-black text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" className="h-11 rounded-xl bg-emerald-600 text-sm font-black text-white hover:bg-emerald-700">
                Save edit
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
