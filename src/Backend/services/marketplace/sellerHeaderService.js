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
        .select("id,conversation_key,buyer_id,created_at")
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
      created_at: order.created_at || null,
    }));
    const latestMessageByConversation = new Map();
    (messagesResult.data || []).forEach((message) => {
      // Match the customer-care grouping: conversations are per buyer.
      const conversationKey = message.buyer_id || `legacy:${message.conversation_key || message.id}`;
      if (!latestMessageByConversation.has(conversationKey)) latestMessageByConversation.set(conversationKey, message);
    });
    const messageItems = Array.from(latestMessageByConversation.entries()).map(([conversationKey, message]) => ({
      id: `seller-message:${conversationKey}:${message.created_at || message.id}`,
      unread: true,
      created_at: message.created_at || null,
    }));
    const notificationItems = (attentionItems || []).map((item) => ({
      id: `seller-alert:${item.id}`,
      unread: true,
      created_at: item.updated_at || item.updatedAt || item.created_at || item.createdAt || null,
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

export async function subscribeSellerHeaderChanges(onChange) {
  const business = await readRegisteredBusiness();
  if (!business?.id) return () => {};
  const channel = supabase.channel(`marketplace-seller-header-${business.id}-${crypto.randomUUID()}`);
  ["marketplace_orders", "marketplace_customer_messages"].forEach((table) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `business_id=eq.${business.id}` }, onChange);
  });
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}

// Pending orders and unread buyer messages for the given businesses (used for
// the business-switcher badge covering the workspaces the seller is NOT
// currently viewing — owned or assigned admin roles alike). RLS trims the
// rows to what this account may actually see, so counts never leak data an
// admin role does not grant.
export async function fetchBusinessAttentionCounts(businessIds = []) {
  const ids = [...new Set(businessIds.filter(Boolean))];
  if (!ids.length) return { total: 0, byBusiness: {} };

  const [ordersResult, messagesResult] = await Promise.all([
    supabase
      .from("marketplace_orders")
      .select("id,business_id")
      .in("business_id", ids)
      .eq("status", "pending")
      .limit(200),
    supabase
      .from("marketplace_customer_messages")
      .select("id,business_id")
      .in("business_id", ids)
      .eq("unread", true)
      .or("sender_role.eq.buyer,sender_role.is.null")
      .limit(200),
  ]);

  const byBusiness = {};
  function add(businessId, key) {
    if (!businessId) return;
    if (!byBusiness[businessId]) byBusiness[businessId] = { orders: 0, messages: 0 };
    byBusiness[businessId][key] += 1;
  }

  (ordersResult.data || []).forEach((row) => add(row.business_id, "orders"));
  (messagesResult.data || []).forEach((row) => add(row.business_id, "messages"));

  const total = Object.values(byBusiness).reduce((sum, item) => sum + item.orders + item.messages, 0);
  return { total, byBusiness };
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
