import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";

const SELLER_HEADER_STATE = {
  orderCount: 0,
  messageCount: 0,
  notificationCount: 0,
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

    const { count: messageCount } = await supabase
      .from("marketplace_customer_messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("unread", true)
      .or("sender_role.eq.buyer,sender_role.is.null");

    return {
      ...SELLER_HEADER_STATE,
      messageCount: messageCount || 0,
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
