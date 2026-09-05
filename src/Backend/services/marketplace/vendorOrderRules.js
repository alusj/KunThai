export function getProductMinimumOrderQuantity(product = {}) {
  const rawValue = product.details?.minimumOrderQuantity ?? product.minimumOrderQuantity ?? 1;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
}

export function normalizeProductOrderQuantity(product, quantity) {
  const minimumQuantity = getProductMinimumOrderQuantity(product);
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed)) return minimumQuantity;
  return Math.max(minimumQuantity, Math.floor(parsed));
}
