import {
  CheckCircle2,
  MapPin,
  MoreHorizontal,
  Phone,
  ShoppingBag,
  StickyNote,
  Trash2,
  Truck,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useSellerSales } from "../../../../../Backend/hooks/useSellerSales";
import { deleteSellerOrder, updateSellerOrderStatus } from "../../../../../Backend/services/marketplace/sellerSalesService";
import { storeSellerOrdersAreaViewReturn } from "../../../../../Backend/services/marketplace/navigationHandoffService";
import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import { formatOrderFulfillment, parseOrderDeliveryDetails } from "../../../../../Backend/utils/orderDeliveryDetails";
import BestSalesWindowCard from "./BestSalesWindowCard";
import OrderStatusGrid from "./OrderStatusGrid";
import RevenueMetrics from "./RevenueMetrics";
import SalesMetricCard from "./SalesMetricCard";

function orderStatusTone(status) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  if (status === "shipped") return "bg-blue-50 text-blue-700";
  if (status === "refunded") return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

function formatOrderDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getOrderAddress(order) {
  const details = parseOrderDeliveryDetails(order.deliveryLocation);
  return details.address || details.raw;
}

export default function BusinessStats({ initialView = "revenue" }) {
  const { revenue, orders, averageOrderValue, bestSalesWindow, recentOrders, loading } = useSellerSales();
  const [activeView, setActiveView] = useState(initialView);
  // Optimistic overlay on the fetched orders: status patches by id plus
  // tombstones for deletes, so an emptied list never falls back to stale rows.
  const [orderStatusPatches, setOrderStatusPatches] = useState({});
  const [deletedOrderIds, setDeletedOrderIds] = useState(() => new Set());
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

  const visibleOrders = recentOrders
    .filter((order) => !deletedOrderIds.has(order.id))
    .map((order) => (orderStatusPatches[order.id] ? { ...order, status: orderStatusPatches[order.id] } : order));

  async function changeOrderStatus(order, status) {
    try {
      await updateSellerOrderStatus(order.id, status);
      setOrderStatusPatches((current) => ({ ...current, [order.id]: status }));
      setFeedback("Order status updated.");
    } catch (err) {
      setFeedback(err.message || "Unable to update order.");
    }
  }

  async function removeOrder(order) {
    try {
      await deleteSellerOrder(order.id);
      setDeletedOrderIds((current) => {
        const next = new Set(current);
        next.add(order.id);
        return next;
      });
      setFeedback("Order deleted.");
    } catch (err) {
      setFeedback(err.message || "Unable to delete order.");
    }
  }

  function locateOrder(order) {
    const address = getOrderAddress(order);
    const hasCoordinates =
      order.deliveryLatitude !== null &&
      order.deliveryLatitude !== undefined &&
      order.deliveryLongitude !== null &&
      order.deliveryLongitude !== undefined;

    if (!hasCoordinates && !address) {
      setFeedback("This order has no delivery address to locate yet.");
      return;
    }

    storeSellerOrdersAreaViewReturn();
    window.dispatchEvent(
      new CustomEvent("kuntai-open-area-view", {
        detail: {
          autoRoute: true,
          returnTo: "marketplace-seller-orders",
          destination: {
            type: "order",
            id: order.id,
            name: `${order.buyerName || "Buyer"} - ${order.preview || "UrMall order"}`,
            address,
            searchQuery: address,
            ...(hasCoordinates ? { lat: Number(order.deliveryLatitude), lng: Number(order.deliveryLongitude) } : {}),
          },
        },
      }),
    );
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
          <SellerOrderQueue
            orders={visibleOrders}
            onStatusChange={changeOrderStatus}
            onDelete={removeOrder}
            onLocate={locateOrder}
          />
        </div>
      ) : null}
    </section>
  );
}

function SellerOrderActionMenu({ order, onAction, onClose }) {
  const actions = [
    order.status !== "shipped" && order.status !== "completed" && order.status !== "cancelled"
      ? { id: "shipped", label: "Mark shipped", icon: Truck, className: "text-blue-700 hover:bg-blue-50" }
      : null,
    order.status !== "completed" && order.status !== "cancelled"
      ? { id: "completed", label: "Complete", icon: CheckCircle2, className: "text-emerald-700 hover:bg-emerald-50" }
      : null,
    order.status !== "cancelled" && order.status !== "completed"
      ? { id: "cancelled", label: "Cancel", icon: XCircle, className: "text-amber-700 hover:bg-amber-50" }
      : null,
    { id: "locate", label: "Locate address", icon: MapPin, className: "text-gray-700 hover:bg-gray-50" },
    { id: "delete", label: "Delete", icon: Trash2, className: "text-red-600 hover:bg-red-50" },
  ].filter(Boolean);

  return (
    <>
      <button
        type="button"
        aria-label="Close order actions"
        onClick={onClose}
        className="fixed inset-0 z-20 cursor-default bg-transparent"
      />
      <div className="absolute right-3 top-12 z-30 w-[min(13rem,calc(100vw-3rem))] rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction(action.id)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-black ${action.className}`}
            >
              <Icon size={16} />
              {action.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function SellerOrderDetailSheet({ order, onClose, onStatusChange, onDelete, onLocate }) {
  const details = parseOrderDeliveryDetails(order.deliveryLocation);
  const fulfillment = formatOrderFulfillment(details);
  const address = details.address || details.raw;
  const rows = [
    { icon: User, label: "Buyer", value: order.buyerName || "Buyer" },
    { icon: Phone, label: "Phone", value: details.phone || details.contact || "Not provided" },
    { icon: Truck, label: "Fulfillment", value: fulfillment || "Not specified" },
    {
      icon: MapPin,
      label: details.addressLabel ? `${details.addressLabel} address` : "Delivery address",
      value: address || "No address added",
    },
    details.note ? { icon: StickyNote, label: "Note", value: details.note } : null,
    details.paymentPreference ? { icon: StickyNote, label: "Payment preference", value: details.paymentPreference } : null,
  ].filter(Boolean);
  const canUpdate = order.status === "pending" || order.status === "shipped";

  return (
    <div className="fixed inset-0 z-[1250] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close order details"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Order details for ${order.preview || "UrMall order"}`}
        className="kt-modal-enter relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Order details</p>
            <h4 className="mt-1 truncate text-lg font-black text-gray-950">{order.preview || "UrMall order"}</h4>
            <p className="mt-1 text-xs font-bold text-gray-500">
              {order.itemCount} item{order.itemCount === 1 ? "" : "s"} | {formatOrderDate(order.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            aria-label="Close order details"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-gray-50 p-3">
          <span className={`rounded-lg px-2.5 py-1 text-xs font-black capitalize ${orderStatusTone(order.status)}`}>
            {order.status}
          </span>
          <p className="text-xl font-black text-gray-950">{formatCurrency(order.totalAmount)}</p>
        </div>

        <div className="mt-4 space-y-2">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.label} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase text-gray-500">{row.label}</p>
                  <p className="mt-0.5 break-words text-sm font-bold text-gray-950">{row.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onLocate(order)}
            className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-950 text-sm font-black text-white hover:bg-gray-800"
          >
            <MapPin size={16} />
            Locate address
          </button>
          {canUpdate && order.status !== "shipped" ? (
            <button
              type="button"
              onClick={() => onStatusChange(order, "shipped")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-50 text-sm font-black text-blue-700 hover:bg-blue-100"
            >
              <Truck size={16} />
              Mark shipped
            </button>
          ) : null}
          {canUpdate ? (
            <button
              type="button"
              onClick={() => onStatusChange(order, "completed")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white hover:bg-emerald-700"
            >
              <CheckCircle2 size={16} />
              Complete
            </button>
          ) : null}
          {canUpdate ? (
            <button
              type="button"
              onClick={() => onStatusChange(order, "cancelled")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-50 text-sm font-black text-amber-700 hover:bg-amber-100"
            >
              <XCircle size={16} />
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onDelete(order)}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-50 text-sm font-black text-red-600 hover:bg-red-100 ${canUpdate ? "" : "col-span-2"}`}
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}

function SellerOrderQueue({ orders = [], onStatusChange, onDelete, onLocate }) {
  const [openMenuId, setOpenMenuId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;

  // A deleted or updated order list can leave the sheet pointing at nothing.
  useEffect(() => {
    if (selectedOrderId && !orders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId("");
    }
  }, [orders, selectedOrderId]);

  if (!orders.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
        <p className="font-black text-gray-950">No seller orders yet</p>
        <p className="mt-1 text-sm font-semibold text-gray-500">New buyer orders will appear here for review and fulfillment.</p>
      </div>
    );
  }

  function runMenuAction(order, actionId) {
    setOpenMenuId("");
    if (actionId === "delete") {
      onDelete?.(order);
      return;
    }
    if (actionId === "locate") {
      onLocate?.(order);
      return;
    }
    onStatusChange?.(order, actionId);
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
        {orders.map((order) => {
          const details = parseOrderDeliveryDetails(order.deliveryLocation);
          const address = details.address || details.raw;
          const fulfillment = formatOrderFulfillment(details);

          return (
            <article key={order.id} className="relative rounded-lg border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedOrderId(order.id)}
                  className="min-w-0 flex-1 rounded-lg text-left transition hover:bg-gray-50"
                >
                  <p className="font-black text-gray-950">{order.preview}</p>
                  <p className="mt-1 text-xs font-bold text-gray-500">
                    {order.buyerName} | {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                    {fulfillment ? ` | ${fulfillment}` : ""}
                  </p>
                  {address ? (
                    <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-gray-600">
                      <MapPin size={14} className="mt-0.5 shrink-0 text-emerald-700" />
                      <span className="line-clamp-2">{address}</span>
                    </p>
                  ) : null}
                  {details.phone ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                      <Phone size={13} className="shrink-0" />
                      {details.phone}
                    </p>
                  ) : null}
                </button>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenMenuId((current) => (current === order.id ? "" : order.id))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50"
                    aria-label={`Actions for order ${order.preview || order.id}`}
                    aria-expanded={openMenuId === order.id}
                    aria-haspopup="menu"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  <p className="text-base font-black text-gray-950">{formatCurrency(order.totalAmount)}</p>
                  <p className={`rounded-lg px-2.5 py-1 text-xs font-black capitalize ${orderStatusTone(order.status)}`}>
                    {order.status}
                  </p>
                </div>
              </div>

              {openMenuId === order.id ? (
                <SellerOrderActionMenu
                  order={order}
                  onAction={(actionId) => runMenuAction(order, actionId)}
                  onClose={() => setOpenMenuId("")}
                />
              ) : null}
            </article>
          );
        })}
      </div>

      {selectedOrder ? (
        <SellerOrderDetailSheet
          order={selectedOrder}
          onClose={() => setSelectedOrderId("")}
          onStatusChange={(order, status) => onStatusChange?.(order, status)}
          onDelete={(order) => {
            setSelectedOrderId("");
            onDelete?.(order);
          }}
          onLocate={(order) => {
            setSelectedOrderId("");
            onLocate?.(order);
          }}
        />
      ) : null}
    </section>
  );
}
