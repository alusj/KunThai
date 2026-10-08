// Whether a listing is boosted right now. marketplace_products.promoted is set
// when a boost starts, but nothing clears it the moment the boost ends, so the
// live marketplace_promotions row (status active, ends_at in the future)
// decides.

export function isPromotionLive(promotion, now = Date.now()) {
  if (!promotion || String(promotion.status || "active") !== "active") return false;
  const endsAt = promotion.ends_at ?? promotion.endsAt ?? null;
  if (!endsAt) return true;
  const end = Date.parse(endsAt);
  return Number.isFinite(end) && end > now;
}

// product id -> { id, endsAt } for every live boost (the one ending last wins).
export function liveProductPromotionMap(rows = [], now = Date.now()) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.product_id || !isPromotionLive(row, now)) continue;
    const current = map.get(row.product_id);
    const endsAt = row.ends_at || null;
    if (!current || (current.endsAt && (!endsAt || Date.parse(endsAt) > Date.parse(current.endsAt)))) {
      map.set(row.product_id, { id: row.id, endsAt });
    }
  }
  return map;
}

// product.livePromotion is { id, endsAt } when boosted, null when not, and
// undefined when unknown (then the stored flag is the only hint).
export function productHasLivePromotion(product, now = Date.now()) {
  if (!product) return false;
  if (product.livePromotion === undefined) return Boolean(product.promoted);
  return isPromotionLive(product.livePromotion, now);
}
