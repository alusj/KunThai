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

export function getTierUnitPrice(tiers, quantity, fallbackPrice) {
  const qty = Math.max(1, Number(quantity || 1));
  const match = normalizeTierPricing(tiers)
    .filter((tier) => qty >= Math.max(1, tier.minQty) && (tier.maxQty <= 0 || qty <= tier.maxQty))
    .sort((a, b) => b.minQty - a.minQty)[0];
  return match ? match.price : Number(fallbackPrice || 0);
}
