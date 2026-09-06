export const PRODUCT_BUSINESS_KINDS = Object.freeze(["retail", "vendor"]);
export const FULFILLMENT_BUSINESS_KINDS = Object.freeze(["retail", "restaurant", "vendor"]);

export function isProductBusinessKind(kind) {
  return PRODUCT_BUSINESS_KINDS.includes(String(kind || "retail").toLowerCase());
}

export function usesMarketplaceCategories(kind) {
  return isProductBusinessKind(kind);
}

export function supportsMarketplaceFulfillment(kind) {
  return FULFILLMENT_BUSINESS_KINDS.includes(String(kind || "retail").toLowerCase());
}

export function hasBusinessPlans(kind) {
  return ["retail", "vendor", "restaurant", "property_agent", "hotel"].includes(String(kind || "retail").toLowerCase());
}
