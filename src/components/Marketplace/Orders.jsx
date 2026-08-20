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
import { resizedImageUrl } from "../../Backend/lib/imageProxy";
import { useI18n, t } from "../../i18n";
import { parseOrderDeliveryDetails, formatOrderFulfillment } from "../../Backend/utils/orderDeliveryDetails";
import {
  markNotificationScopeVisited,
  markNotificationsSeen,
} from "../../Backend/services/notificationSeenStore";
import AppBackTab from "../shared/AppBackTab";
import { t as i18nText } from "../../i18n/index";

const BUYER_ORDER_SCOPE = "urmall:buyer:orders";

// Must mirror mapHeaderItem in MarketplaceHeader so viewing the order list
// clears the same notification ids the header badge counts.
function toOrderNotificationItem(order) {
  const changeKey = [order.status, order.createdAt].filter(Boolean).join(":");
  return {
    id: `buyer-order:${order.id}${changeKey ? `:${changeKey}` : ""}`,
    unread: true,
    created_at: order.createdAt || null,
  };
}

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
    t("urmall.orders.shareOrderLabel", { value: order.preview || t("urmall.orders.orderTitle") }),
    t("urmall.orders.shareSellerLabel", { value: order.sellerName }),
    t("urmall.orders.shareStatusLabel", { value: order.status }),
    t("urmall.orders.shareTotalLabel", { value: formatCurrency(order.totalAmount) }),
    order.deliveryLocation ? t("urmall.orders.shareDeliveryLabel", { value: order.deliveryLocation }) : "",
  ].filter(Boolean).join("\n");
}

export default function Orders({ compact = false, onBack, onProductOpen }) {
  useI18n();
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
        if (alive) {
          setOrders(rows);
          markNotificationsSeen(BUYER_ORDER_SCOPE, rows.map(toOrderNotificationItem));
          markNotificationScopeVisited(BUYER_ORDER_SCOPE);
        }
      } catch (err) {
        if (alive) setError(err.message || t("urmall.orders.loadFailed"));
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
      setNotice(t("urmall.orders.productNotOpenable"));
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
      setNotice(t("urmall.orders.detailsCopied"));
    } catch {
      setNotice(text);
    }
    setOpenMenuId("");
  }

  async function shareOrder(order) {
    const text = orderShareText(order);
    try {
      if (navigator.share) {
        await navigator.share({ title: t("urmall.orders.orderTitle"), text });
        setNotice(t("urmall.orders.detailsShared"));
      } else {
        await navigator.clipboard.writeText(text);
        setNotice(t("urmall.orders.shareUnavailable"));
      }
    } catch {
      setNotice(t("urmall.orders.shareCancelled"));
    }
    setOpenMenuId("");
  }

  async function removeOrder(order) {
    try {
      await hideBuyerOrder(order.id);
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setNotice(t("urmall.orders.deletedFromList"));
    } catch (err) {
      setNotice(err.message || t("urmall.orders.deleteFailed"));
    }
    setOpenMenuId("");
  }

  async function cancelOrder(order) {
    try {
      await cancelBuyerOrder(order.id);
      setOrders((current) => current.map((item) => (item.id === order.id ? { ...item, status: i18nText("ui.literals.k8761d26fb8d6") } : item)));
      setNotice(t("urmall.orders.cancelled"));
    } catch (err) {
      setNotice(err.message || t("urmall.orders.cancelFailed"));
    }
    setOpenMenuId("");
  }

  async function reorder(order) {
    try {
      const product = await findBuyerOrderProduct(order);
      if (!product) {
        setNotice(t("urmall.orders.reorderFailedAdd"));
        return;
      }
      const result = await addBuyerCartItem(product, Math.max(1, Number(order.itemCount || 1)));
      setNotice(result?.status === "alreadyInCart" ? t("urmall.browse.alreadyInCart") : t("urmall.orders.addedBackToCart"));
    } catch (err) {
      setNotice(err.message || t("urmall.orders.reorderFailed"));
    }
    setOpenMenuId("");
  }

  async function messageSeller(order) {
    try {
      await sendBuyerMarketplaceMessage({
        seller: { id: order.businessId },
        product: order.product || (order.productId ? { id: order.productId, name: order.preview, businessId: order.businessId } : null),
        topic: order.preview || t("urmall.orders.orderTitle"),
        message: t("urmall.orders.orderHelpGreeting", { order: order.preview || order.id }),
        messageType: "order",
      });
      setNotice(t("urmall.seller.messageSent"));
    } catch (err) {
      setNotice(err.message || t("urmall.browse.messageFailed"));
    }
    setOpenMenuId("");
  }

  function timelineSteps(order) {
    return [
      ["pending", t("urmall.orders.stepCreated")],
      ["shipped", t("urmall.orders.stepShipping")],
      ["completed", t("urmall.orders.stepCompleted")],
    ].map(([status, label]) => {
      const active = order.status === status || (order.status === "completed" && status !== "cancelled") || (order.status === "shipped" && status === "pending");
      return { status, label, active };
    });
  }

  return (
    <main className={compact ? "bg-gray-50" : "min-h-screen bg-gray-50"}>
      {!compact ? (
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-white px-4">
          <AppBackTab onBack={onBack} label={t("urmall.shell.backToUrMall")} historyKey="marketplace-orders" />
          <div>
            <h1 className="text-lg font-black text-gray-950">{t("urmall.orders.title")}</h1>
            <p className="text-xs font-bold text-gray-500">{t("urmall.orders.subtitle")}</p>
          </div>
        </header>
      ) : null}

      <section className="w-full space-y-3 p-4 sm:p-6 lg:p-8">
        {error ? <p className="rounded-lg bg-red-50 p-4 font-bold text-red-700">{error}</p> : null}
        {notice ? <p className="rounded-lg bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{notice}</p> : null}

        {!loading && !error && !orders.length ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <ReceiptText className="mx-auto text-gray-400" size={36} />
            <p className="mt-3 font-black text-gray-950">{t("urmall.orders.noOrders")}</p>
            <p className="mt-1 text-sm font-medium text-gray-500">{t("urmall.orders.noOrdersHint")}</p>
          </div>
        ) : null}

        {orders.map((order) => (
          <article key={order.id} className="relative rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button type="button" onClick={() => openProduct(order)} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left transition hover:bg-gray-50">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  {order.product?.imageUrl || order.sellerLogoUrl ? (
                    <img src={resizedImageUrl(order.product?.imageUrl || order.sellerLogoUrl, { width: 128, quality: 70 })} alt="" className="h-full w-full rounded-lg object-cover" />
                  ) : (
                    <PackageCheck size={22} />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-black text-gray-950">{order.product?.name || order.sellerName}</h2>
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-gray-500">
                    <MapPin size={13} />
                    {order.sellerLocation || order.deliveryLocation || t("urmall.orders.locationNotAdded")}
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
                  aria-label={t("urmall.orders.orderActionsAria")}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
            </div>

            <button type="button" onClick={() => openProduct(order)} className="mt-4 w-full rounded-lg bg-gray-50 p-3 text-left transition hover:bg-emerald-50/50">
              <p className="text-sm font-bold text-gray-700">{order.preview || t("urmall.orders.orderTitle")}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-gray-500">
                  {t(order.itemCount === 1 ? "urmall.orders.itemsDateOne" : "urmall.orders.itemsDateOther", { count: order.itemCount, date: formatDate(order.createdAt) })}
                </p>
                <p className="text-lg font-black text-gray-950">{formatCurrency(order.totalAmount)}</p>
              </div>
            </button>

            {order.deliveryLocation ? (() => {
              const details = parseOrderDeliveryDetails(order.deliveryLocation);
              const fulfillment = formatOrderFulfillment(details);
              const address = details.address || details.raw;
              return (
                <div className="mt-3 space-y-1 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                  {fulfillment ? (
                    <p className="text-[11px] font-black uppercase text-gray-500">{fulfillment}{details.addressLabel ? i18nText("ui.literals.k1c5da69e6e3b", { value0: t("urmall.detail.addressLabel", { label: details.addressLabel }) }) : ""}</p>
                  ) : null}
                  {address ? (
                    <p className="flex items-start gap-1.5 text-xs font-bold text-gray-700">
                      <MapPin size={13} className="mt-0.5 shrink-0 text-emerald-700" />
                      <span className="break-words">{address}</span>
                    </p>
                  ) : null}
                  {details.phone ? <p className="text-xs font-semibold text-gray-500">{t("urmall.orders.phoneLabel", { phone: details.phone })}</p> : null}
                  {details.note ? <p className="text-xs font-semibold text-gray-500">{t("urmall.orders.noteLabel", { note: details.note })}</p> : null}
                </div>
              );
            })() : null}

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
                  {t("urmall.seller.menuView")}
                </button>
                <button type="button" onClick={() => messageSeller(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <MessageCircle size={16} />
                  {t("urmall.detail.messageSellerTitle")}
                </button>
                <button type="button" onClick={() => reorder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <RotateCcw size={16} />
                  {t("urmall.orders.reorderAction")}
                </button>
                <button type="button" onClick={() => copyOrder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <Copy size={16} />
                  {t("urmall.orders.copyDetails")}
                </button>
                <button type="button" onClick={() => shareOrder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                  <Share2 size={16} />
                  {t("urmall.orders.shareAction")}
                </button>
                {order.status === "pending" ? (
                  <button type="button" onClick={() => cancelOrder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-amber-700 hover:bg-amber-50">
                    <XCircle size={16} />
                    {t("urmall.orders.cancelOrderAction")}
                  </button>
                ) : null}
                <button type="button" onClick={() => removeOrder(order)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-red-600 hover:bg-red-50">
                  <Trash2 size={16} />
                  {t("urmall.orders.deleteFromList")}
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>

    </main>
  );
}
