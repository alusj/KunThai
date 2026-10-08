import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";
import { t } from "../../../i18n";

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

const OPEN_ORDER_STATUSES = new Set(["pending", "shipped"]);
const RECENT_CLOSED_ORDERS = 30;

export async function fetchSellerSales() {
  const business = await readRegisteredBusiness();
  if (!business) {
    return null;
  }

  const { data, error } = await supabase
    .from("marketplace_orders")
    .select("*")
    .eq("business_id", business.id);

  if (error) throw new Error(error.message);

  const orders = data || [];
  const sortedOrders = [...orders].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const completedOrders = orders.filter((order) => order.status === "completed");
  const totalRevenue = (items) => items.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  return {
    revenue: {
      today: totalRevenue(completedOrders.filter((order) => new Date(order.created_at) >= todayStart)),
      weekly: totalRevenue(completedOrders.filter((order) => new Date(order.created_at) >= weekStart)),
      monthly: totalRevenue(completedOrders.filter((order) => new Date(order.created_at) >= monthStart)),
    },
    orders: {
      total: orders.length,
      pending: orders.filter((order) => order.status === "pending").length,
      completed: completedOrders.length,
      cancelled: orders.filter((order) => order.status === "cancelled").length,
      refunded: orders.filter((order) => order.status === "refunded").length,
    },
    averageOrderValue: completedOrders.length ? totalRevenue(completedOrders) / completedOrders.length : 0,
    bestSalesWindow: {
      day: "Not enough data yet",
      time: "Start selling to discover this",
      orderCount: 0,
    },
    // Every order still waiting for the seller (pending or shipped) is listed,
    // however old, then the 30 most recent finished ones.
    recentOrders: [
      ...sortedOrders.filter((order) => OPEN_ORDER_STATUSES.has(order.status || "pending")),
      ...sortedOrders.filter((order) => !OPEN_ORDER_STATUSES.has(order.status || "pending")).slice(0, RECENT_CLOSED_ORDERS),
    ]
      .map((order) => ({
        id: order.id,
        status: order.status || "pending",
        totalAmount: Number(order.total_amount || 0),
        itemCount: Number(order.item_count || 0),
        preview: order.preview || "UrMall order",
        buyerName: order.buyer_name || "Buyer",
        deliveryLocation: order.delivery_location || "",
        deliveryLatitude: order.delivery_latitude === null || order.delivery_latitude === undefined ? null : Number(order.delivery_latitude),
        deliveryLongitude: order.delivery_longitude === null || order.delivery_longitude === undefined ? null : Number(order.delivery_longitude),
        currency: order.currency || "",
        countryIso: order.country_iso || "",
        createdAt: order.created_at,
      })),
  };
}

// `expectedStatus` is the status the seller was looking at: the change only
// applies if the order is still in it, so a buyer's cancellation (or another
// admin's change) made meanwhile is never overwritten. Zero changed rows means
// the order moved on or this account may not change it.
export async function updateSellerOrderStatus(orderId, status, expectedStatus = "") {
  const business = await readRegisteredBusiness();
  if (!business) {
    throw new Error("Register a business before managing orders.");
  }

  let query = supabase
    .from("marketplace_orders")
    .update({ status })
    .eq("id", orderId)
    .eq("business_id", business.id);
  if (expectedStatus) query = query.eq("status", expectedStatus);
  const { data, error } = await query.select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(t("sellerGuard.orderChanged"));
  window.dispatchEvent(new CustomEvent("marketplace-orders-updated"));
}

// Only a cancelled order can be deleted: completed orders are the buyer's
// purchase history and what verified reviews are tied to.
export async function deleteSellerOrder(orderId) {
  const business = await readRegisteredBusiness();
  if (!business) {
    throw new Error("Register a business before managing orders.");
  }

  const { data, error } = await supabase
    .from("marketplace_orders")
    .delete()
    .eq("id", orderId)
    .eq("business_id", business.id)
    .eq("status", "cancelled")
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(t("sellerGuard.orderChanged"));
  window.dispatchEvent(new CustomEvent("marketplace-orders-updated"));
}

// Orders for KAI sales trends: the last `days` plus the period before it,
// so the assistant can compare like with like. Read-only, own business only.
export async function fetchSellerOrdersForTrend(days = 30) {
  const business = await readRegisteredBusiness();
  if (!business) return null;

  const since = new Date(Date.now() - Number(days) * 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("marketplace_orders")
    .select("id,status,total_amount,item_count,created_at")
    .eq("business_id", business.id)
    .gte("created_at", since);

  if (error) throw new Error(error.message);
  return { currency: business.location?.currency || "", orders: data || [] };
}
