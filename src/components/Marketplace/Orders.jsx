import { useEffect, useState } from "react";
import { Copy, Eye, MapPin, MessageCircle, MoreHorizontal, PackageCheck, ReceiptText, RotateCcw, Share2, Trash2, XCircle } from "lucide-react";

import {
  addBuyerCartItem,
  cancelBuyerOrder,
  fetchBuyerOrders,
  findBuyerOrderProduct,
  hideBuyerOrder,
  sendBuyerMarketplaceMessage,
} from "../../Backend/services/marketplace/buyerMarketplaceService";
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

  async function cancelOrder(order) {
    try {
      await cancelBuyerOrder(order.id);
      setOrders((current) => current.map((item) => (item.id === order.id ? { ...item, status: "cancelled" } : item)));
      setNotice("Order cancelled.");
    } catch (err) {
      setNotice(err.message || "Unable to cancel this order.");
    }
    setOpenMenuId("");
  }

  async function reorder(order) {
    try {
      const product = await findBuyerOrderProduct(order);
      if (!product) {
        setNotice("This product could not be added again.");
        return;
      }
      await addBuyerCartItem(product, Math.max(1, Number(order.itemCount || 1)));
      setNotice("Product added back to cart.");
    } catch (err) {
      setNotice(err.message || "Unable to reorder this product.");
    }
    setOpenMenuId("");
  }

  async function messageSeller(order) {
    try {
      await sendBuyerMarketplaceMessage({
        seller: { id: order.businessId },
        product: order.product || (order.productId ? { id: order.productId, name: order.preview, businessId: order.businessId } : null),
        topic: order.preview || "UrMall order",
        message: `Hello, I need help with my order: ${order.preview || order.id}.`,
        messageType: "order",
      });
      setNotice("Message sent to seller.");
    } catch (err) {
      setNotice(err.message || "Unable to message seller.");
    }
    setOpenMenuId("");
  }

  function timelineSteps(order) {
    return [
      ["pending", "Order created"],
      ["shipped", "Seller shipping"],
      ["completed", "Completed"],
    ].map(([status, label]) => {
      const active = order.status === status || (order.status === "completed" && status !== "cancelled") || (order.status === "shipped" && status === "pending");
      return { status, label, active };
    });
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

            <div className="mt-4 grid grid-cols-3 gap-2">
              {timelineSteps(order).map((step) => (
                <div key={step.status} className={`rounded-lg px-2 py-2 text-center text-[11px] font-black ${step.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-400"}`}>
                  {step.label}
                </div>
              ))}
            </div>

            {openMenuId === order.id ? (
              <div className="absolute right-4 top-14 z-20 w-[min(14rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
                <button type="button" onClick={() => openProduct(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <Eye size={16} />
                  View product
                </button>
                <button type="button" onClick={() => messageSeller(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <MessageCircle size={16} />
                  Message seller
                </button>
                <button type="button" onClick={() => reorder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <RotateCcw size={16} />
                  Reorder
                </button>
                <button type="button" onClick={() => copyOrder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <Copy size={16} />
                  Copy details
                </button>
                <button type="button" onClick={() => shareOrder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <Share2 size={16} />
                  Share
                </button>
                {order.status === "pending" ? (
                  <button type="button" onClick={() => cancelOrder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-amber-700 hover:bg-amber-50">
                    <XCircle size={16} />
                    Cancel order
                  </button>
                ) : null}
                <button type="button" onClick={() => removeOrder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-red-600 hover:bg-red-50">
                  <Trash2 size={16} />
                  Delete from my list
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>

    </main>
  );
}
