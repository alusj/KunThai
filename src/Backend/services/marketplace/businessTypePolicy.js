export const BUSINESS_TYPE_LIMITS = Object.freeze({ free: 1, pro: 2, premium: 4 });
export const CURRENT_BUSINESS_TYPES = Object.freeze(["retail", "vendor", "restaurant", "property_agent"]);

export function canonicalBusinessType(kind = "retail") {
  const normalized = String(kind || "retail").toLowerCase();
  return normalized === "hotel" ? "property_agent" : normalized;
}

export function businessTypeCapacity({ planCode = "free", usedKinds = [], upgradeBusinessId = "" } = {}) {
  const plan = Object.hasOwn(BUSINESS_TYPE_LIMITS, planCode) ? planCode : "free";
  const kinds = [...new Set(usedKinds.map(canonicalBusinessType))];
  const limit = BUSINESS_TYPE_LIMITS[plan];
  const atLimit = kinds.length >= limit;
  return {
    planCode: plan,
    limit,
    usedKinds: kinds,
    current: kinds.length,
    allowed: !atLimit,
    requiredPlan: atLimit && kinds.length < 4 ? (kinds.length < 2 ? "pro" : "premium") : "",
    upgradeBusinessId,
  };
}

export function highestOwnedBusinessPlan(businesses, subscriptions, now = Date.now()) {
  const ownedIds = new Set(businesses.map((business) => business.id));
  return subscriptions
    .filter((subscription) => ownedIds.has(subscription.marketplace_business_id)
      && subscription.status === "active"
      && (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > now))
    .sort((a, b) => (BUSINESS_TYPE_LIMITS[b.plan_code] || 1) - (BUSINESS_TYPE_LIMITS[a.plan_code] || 1))[0] || null;
}
