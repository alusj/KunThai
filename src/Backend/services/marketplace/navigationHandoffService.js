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
