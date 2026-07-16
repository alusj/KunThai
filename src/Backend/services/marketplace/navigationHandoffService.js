const SELLER_AREA_RETURN_KEY = "kuntai.marketplace.areaViewSellerReturn";

export function storeSellerAreaViewReturn(seller) {
  if (!seller || typeof seller !== "object") return;

  try {
    sessionStorage.setItem(SELLER_AREA_RETURN_KEY, JSON.stringify(seller));
  } catch {
    // Area View navigation should still work when session storage is unavailable.
  }
}

export function consumeSellerAreaViewReturn() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SELLER_AREA_RETURN_KEY) || "null");
    sessionStorage.removeItem(SELLER_AREA_RETURN_KEY);
    return stored && typeof stored === "object" && stored.id ? stored : null;
  } catch {
    sessionStorage.removeItem(SELLER_AREA_RETURN_KEY);
    return null;
  }
}

// Set when a seller opens an order address in Area View so the back action can
// land on the seller orders screen instead of the marketplace home.
const SELLER_ORDERS_AREA_RETURN_KEY = "kuntai.marketplace.areaViewSellerOrdersReturn";

export function storeSellerOrdersAreaViewReturn() {
  try {
    sessionStorage.setItem(SELLER_ORDERS_AREA_RETURN_KEY, "1");
  } catch {
    // Area View navigation should still work when session storage is unavailable.
  }
}

// Peeked (without clearing) by Marketplace to reopen the business workspace;
// consumed by the workspace itself to open the orders screen.
export function peekSellerOrdersAreaViewReturn() {
  try {
    return sessionStorage.getItem(SELLER_ORDERS_AREA_RETURN_KEY) === "1";
  } catch {
    return false;
  }
}

export function consumeSellerOrdersAreaViewReturn() {
  try {
    const stored = sessionStorage.getItem(SELLER_ORDERS_AREA_RETURN_KEY) === "1";
    sessionStorage.removeItem(SELLER_ORDERS_AREA_RETURN_KEY);
    return stored;
  } catch {
    return false;
  }
}
