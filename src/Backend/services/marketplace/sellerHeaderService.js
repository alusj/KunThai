import supabase from "../../lib/supabaseClient";
import { fetchSellerAttentionItems } from "./sellerAttentionService";
import { readRegisteredBusiness } from "./sellerRegistrationService";

const SELLER_HEADER_STATE = {
  orderCount: 0,
  messageCount: 0,
  notificationCount: 0,
  orderItems: [],
  messageItems: [],
  notificationItems: [],
  searchSuggestions: [
    "Headphones",
    "Pending orders",
    "Low stock",
    "Payouts",
    "Store settings",
  ],
};

export async function fetchSellerHeaderState() {
  try {
    const business = await readRegisteredBusiness();
    if (!business?.id) return SELLER_HEADER_STATE;

    const [ordersResult, messagesResult, attentionItems] = await Promise.all([
      supabase
        .from("marketplace_orders")
        .select("id,status,created_at")
        .eq("business_id", business.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("marketplace_customer_messages")
        .select("id,conversation_key,created_at")
        .eq("business_id", business.id)
        .eq("unread", true)
        .or("sender_role.eq.buyer,sender_role.is.null")
        .order("created_at", { ascending: false })
        .limit(30),
      fetchSellerAttentionItems().catch(() => []),
    ]);

    const orderItems = (ordersResult.data || []).map((order) => ({
      id: `seller-order:${order.id}`,
      unread: true,
    }));
    const messageItems = (messagesResult.data || []).map((message) => ({
      id: `seller-message:${message.conversation_key || message.id}`,
      unread: true,
    }));
    const notificationItems = (attentionItems || []).map((item) => ({
      id: `seller-alert:${item.id}`,
      unread: true,
    }));

    return {
      ...SELLER_HEADER_STATE,
      orderCount: orderItems.length,
      messageCount: messageItems.length,
      notificationCount: notificationItems.length,
      orderItems,
      messageItems,
      notificationItems,
    };
  } catch {
    return SELLER_HEADER_STATE;
  }
}

export async function searchSellerWorkspace(query) {
  const trimmedQuery = query.trim().toLowerCase();

  if (!trimmedQuery) {
    return [];
  }

  return SELLER_HEADER_STATE.searchSuggestions.filter((item) =>
    item.toLowerCase().includes(trimmedQuery),
  );
}
