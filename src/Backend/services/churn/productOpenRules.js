// Which KunThai sector a screen belongs to, for churn intelligence opens.
// Keys match public.churn_product_settings (20261106131000_churn_activity_layer.sql).
export const CHURN_OPEN_PRODUCTS = Object.freeze([
  "explore",
  "swip",
  "urmall_buyer",
  "urmall_seller",
  "urride_passenger",
  "urride_operator",
]);

export function isChurnOpenProduct(product) {
  return CHURN_OPEN_PRODUCTS.includes(product);
}

// The main bottom-tab page → the sector opened. UrMall's own business screen
// is the seller side; everything else in UrMall is the buyer side.
export function productForMainPage(page, marketplaceSub = "") {
  const normalized = String(page || "").toLowerCase();
  if (normalized === "explore") return "explore";
  if (normalized === "marketplace" || normalized === "urmall") {
    return marketplaceSub === "business" ? "urmall_seller" : "urmall_buyer";
  }
  if (normalized === "transport" || normalized === "urride") return "urride_passenger";
  return "";
}

// Days are UTC, the same as churn_activity_daily.day on the server.
export function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function productOpenStorageKey(userId, product) {
  return `kunthai-product-open:${userId}:${product}`;
}

export function shouldRecordProductOpen({ userId, product, lastRecordedDay, today }) {
  if (!userId || !isChurnOpenProduct(product)) return false;
  return lastRecordedDay !== today;
}
