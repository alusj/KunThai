import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

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
  };
}
