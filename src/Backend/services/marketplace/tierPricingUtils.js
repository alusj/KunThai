export function normalizeTierPricing(tiers = []) {
  if (!Array.isArray(tiers)) return [];

  return tiers
    .map((tier) => {
      const minQty = Number(tier.minQty ?? tier.min_qty ?? 0);
      const maxQty = Number(tier.maxQty ?? tier.max_qty ?? 0);
      const price = Number(tier.price ?? 0);
      return {
        minQty: Number.isFinite(minQty) ? minQty : 0,
        maxQty: Number.isFinite(maxQty) ? maxQty : 0,
        price: Number.isFinite(price) ? price : 0,
      };
    })
    .filter((tier) => tier.price > 0 && (tier.minQty > 0 || tier.maxQty > 0));
}

export function getProductTierPricing(product = {}) {
  return normalizeTierPricing(
    product.tierPricing || product.tier_pricing || product.details?.tierPricing || product.product_attributes?.tierPricing,
  );
}

// fallbackPrice is the product's selling price (already discounted). A bulk
// tier never costs more than that: the lowest applicable unit price wins.
// Mirrored on the server by kunthai_marketplace_unit_price.
export function getTierUnitPrice(tiers, quantity, fallbackPrice) {
  const qty = Math.max(1, Number(quantity || 1));
  const basePrice = Number(fallbackPrice || 0);
  const match = normalizeTierPricing(tiers)
    .filter((tier) => qty >= Math.max(1, tier.minQty) && (tier.maxQty <= 0 || qty <= tier.maxQty))
    .sort((a, b) => b.minQty - a.minQty)[0];
  if (!match) return basePrice;
  return basePrice > 0 ? Math.min(match.price, basePrice) : match.price;
}
