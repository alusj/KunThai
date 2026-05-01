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
  return SELLER_HEADER_STATE;
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
