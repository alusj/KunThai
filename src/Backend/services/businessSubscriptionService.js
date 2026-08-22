import supabase from "../lib/supabaseClient";

export const BUSINESS_PLAN_SURFACES = Object.freeze({
  URMALL: "urmall",
  URRIDE: "urride",
});

export const BUSINESS_PLAN_UPDATED_EVENT = "kunthai-business-subscription-updated";
export const OPERATOR_CAPACITY_PACK_CREDITS = 20;
export const OPERATOR_CAPACITY_PACK_SIZE = 10;

const FALLBACK_PLANS = Object.freeze({
  urmall: [
    {
      surface: "urmall",
      planCode: "free",
      displayName: "Free",
      creditCost: 0,
      durationDays: 30,
      graceDays: 7,
      productLimit: 10,
      operatorLimit: null,
      vehicleLimit: null,
      adminLimit: 0,
      features: ["10 active products", "Seller dashboard", "Customer messages", "Store analytics"],
      sortOrder: 1,
    },
    {
      surface: "urmall",
      planCode: "pro",
      displayName: "Pro",
      creditCost: 30,
      yearlyCreditCost: 300,
      yearlyDurationDays: 365,
      durationDays: 30,
      graceDays: 7,
      productLimit: 50,
      operatorLimit: null,
      vehicleLimit: null,
      adminLimit: 1,
      features: ["50 active products", "1 business admin", "Advanced product insights", "Priority store tools"],
      sortOrder: 2,
    },
    {
      surface: "urmall",
      planCode: "premium",
      displayName: "Premium",
      creditCost: 75,
      yearlyCreditCost: 750,
      yearlyDurationDays: 365,
      durationDays: 30,
      graceDays: 7,
      productLimit: null,
      operatorLimit: null,
      vehicleLimit: null,
      adminLimit: 5,
      features: ["Unlimited active products", "Up to 5 business admins", "Full business insights", "Premium store tools"],
      sortOrder: 3,
    },
  ],
  urride: [
    {
      surface: "urride",
      planCode: "free",
      displayName: "Free",
      creditCost: 0,
      durationDays: 30,
      graceDays: 7,
      productLimit: null,
      operatorLimit: 5,
      vehicleLimit: 5,
      adminLimit: 0,
      features: ["5 company operators", "5 registered vehicles", "Fleet workspace", "Ride activity"],
      sortOrder: 1,
    },
    {
      surface: "urride",
      planCode: "pro",
      displayName: "Pro",
      creditCost: 40,
      yearlyCreditCost: 400,
      yearlyDurationDays: 365,
      durationDays: 30,
      graceDays: 7,
      productLimit: null,
      operatorLimit: 15,
      vehicleLimit: 15,
      adminLimit: 1,
      features: ["15 company operators", "15 registered vehicles", "1 company admin", "Advanced fleet tools"],
      sortOrder: 2,
    },
    {
      surface: "urride",
      planCode: "premium",
      displayName: "Premium",
      creditCost: 100,
      yearlyCreditCost: 1000,
      yearlyDurationDays: 365,
      durationDays: 30,
      graceDays: 7,
      productLimit: null,
      operatorLimit: 50,
      vehicleLimit: 50,
      adminLimit: 5,
      features: ["50 company operators", "50 registered vehicles", "Up to 5 company admins", "Operator capacity packs"],
      sortOrder: 3,
    },
  ],
});

export const PLAN_TIER_RANK = Object.freeze({ free: 1, pro: 2, premium: 3 });

// True when `planCode` is at least the `requiredCode` tier (free < pro < premium).
export function planTierMeets(planCode, requiredCode) {
  const have = PLAN_TIER_RANK[String(planCode || "free").toLowerCase()] || 1;
  const need = PLAN_TIER_RANK[String(requiredCode || "free").toLowerCase()] || 1;
  return have >= need;
}

const RESOURCE_CONFIG = Object.freeze({
  products: { limitKey: "productLimit", label: "active products" },
  operators: { limitKey: "operatorLimit", label: "company operators" },
  vehicles: { limitKey: "vehicleLimit", label: "registered vehicles" },
  admins: { limitKey: "adminLimit", label: "business administrators" },
});

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function normalizePlan(plan = {}, fallbackSurface = "urmall") {
  return {
    surface: String(plan.surface || fallbackSurface).toLowerCase(),
    planCode: String(plan.plan_code || plan.planCode || "free").toLowerCase(),
    displayName: plan.display_name || plan.displayName || "Free",
    creditCost: Number(plan.credit_cost ?? plan.creditCost ?? 0),
    yearlyCreditCost: numberOrNull(plan.yearly_credit_cost ?? plan.yearlyCreditCost),
    yearlyDurationDays: numberOrNull(plan.yearly_duration_days ?? plan.yearlyDurationDays),
    durationDays: Number(plan.duration_days ?? plan.durationDays ?? 30),
    graceDays: Number(plan.grace_days ?? plan.graceDays ?? 7),
    productLimit: numberOrNull(plan.product_limit ?? plan.productLimit),
    operatorLimit: numberOrNull(plan.operator_limit ?? plan.operatorLimit),
    vehicleLimit: numberOrNull(plan.vehicle_limit ?? plan.vehicleLimit),
    adminLimit: numberOrNull(plan.admin_limit ?? plan.adminLimit),
    features: Array.isArray(plan.features) ? plan.features.filter(Boolean) : [],
    sortOrder: Number(plan.sort_order ?? plan.sortOrder ?? 0),
  };
}

function normalizeEntitlement(entitlement = {}, fallbackPlan = {}) {
  return {
    planCode: String(entitlement.plan_code || entitlement.planCode || fallbackPlan.planCode || "free").toLowerCase(),
    planName: entitlement.plan_name || entitlement.planName || fallbackPlan.displayName || "Free",
    status: String(entitlement.status || "active").toLowerCase(),
    productLimit: numberOrNull(entitlement.product_limit ?? entitlement.productLimit ?? fallbackPlan.productLimit),
    operatorLimit: numberOrNull(entitlement.operator_limit ?? entitlement.operatorLimit ?? fallbackPlan.operatorLimit),
    vehicleLimit: numberOrNull(entitlement.vehicle_limit ?? entitlement.vehicleLimit ?? fallbackPlan.vehicleLimit),
    adminLimit: numberOrNull(entitlement.admin_limit ?? entitlement.adminLimit ?? fallbackPlan.adminLimit),
    operatorPackCount: Number(entitlement.operator_pack_count ?? entitlement.operatorPackCount ?? 0),
  };
}

function normalizeSubscription(subscription = {}) {
  return {
    id: subscription.id || "",
    planCode: String(subscription.plan_code || subscription.planCode || "free").toLowerCase(),
    status: String(subscription.status || "active").toLowerCase(),
    pendingPlanCode: subscription.pending_plan_code || subscription.pendingPlanCode || "",
    billingInterval: String(subscription.billing_interval || subscription.billingInterval || "monthly").toLowerCase() === "yearly" ? "yearly" : "monthly",
    pendingBillingInterval: subscription.pending_billing_interval || subscription.pendingBillingInterval || "",
    autoRenew: Boolean(subscription.auto_renew ?? subscription.autoRenew),
    payerUserId: subscription.payer_user_id || subscription.payerUserId || "",
    currentPeriodStart: subscription.current_period_start || subscription.currentPeriodStart || null,
    currentPeriodEnd: subscription.current_period_end || subscription.currentPeriodEnd || null,
    graceEndsAt: subscription.grace_ends_at || subscription.graceEndsAt || null,
    operatorPackCount: Number(subscription.operator_pack_count ?? subscription.operatorPackCount ?? 0),
  };
}

function unavailableFeature(error) {
  const message = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  return (
    error?.code === "PGRST202" ||
    error?.code === "42P01" ||
    error?.code === "42883" ||
    message.includes("could not find the function") ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  );
}

export function getFallbackBusinessPlans(surface) {
  return (FALLBACK_PLANS[String(surface || "").toLowerCase()] || []).map((plan) => ({ ...plan }));
}

export function normalizeBusinessSubscriptionState(raw = {}, surface = "urmall", entityId = "") {
  const normalizedSurface = String(raw.surface || surface || "urmall").toLowerCase();
  const fallbackPlans = getFallbackBusinessPlans(normalizedSurface);
  const plans = (Array.isArray(raw.plans) && raw.plans.length ? raw.plans : fallbackPlans)
    .map((plan) => normalizePlan(plan, normalizedSurface))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const freePlan = plans.find((plan) => plan.planCode === "free") || fallbackPlans[0] || {};
  const subscription = normalizeSubscription(raw.subscription);
  const entitlement = normalizeEntitlement(raw.entitlement, plans.find((plan) => plan.planCode === subscription.planCode) || freePlan);
  const usage = {
    products: Number(raw.usage?.products || 0),
    operators: Number(raw.usage?.operators || 0),
    vehicles: Number(raw.usage?.vehicles || 0),
    admins: Number(raw.usage?.admins || 0),
  };

  return {
    available: raw.available !== false,
    surface: normalizedSurface,
    entityId: raw.entity_id || raw.entityId || entityId,
    walletBalance: Number(raw.wallet_balance ?? raw.walletBalance ?? 0),
    plans,
    subscription,
    entitlement,
    usage,
  };
}

function fallbackState(surface, entityId) {
  return normalizeBusinessSubscriptionState(
    {
      available: false,
      surface,
      entity_id: entityId,
      subscription: { plan_code: "free", status: "active", auto_renew: false },
      entitlement: { plan_code: "free", plan_name: "Free", status: "active" },
      usage: {},
    },
    surface,
    entityId,
  );
}

async function callSubscriptionRpc(name, params, { allowUnavailable = false } = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) {
    if (allowUnavailable && unavailableFeature(error)) return null;
    throw parseBusinessPlanError(error);
  }
  return data;
}

export async function fetchBusinessSubscription(surface, entityId, { sync = false } = {}) {
  if (!entityId) return fallbackState(surface, entityId);
  const rpcName = sync ? "sync_kunthai_business_subscription" : "get_kunthai_business_subscription";
  const data = await callSubscriptionRpc(
    rpcName,
    { p_surface: String(surface).toLowerCase(), p_entity_id: entityId },
    { allowUnavailable: true },
  );
  return data ? normalizeBusinessSubscriptionState(data, surface, entityId) : fallbackState(surface, entityId);
}

export async function changeBusinessPlan(surface, entityId, planCode, autoRenew = true, billingInterval = "monthly") {
  const interval = String(billingInterval).toLowerCase() === "yearly" ? "yearly" : "monthly";
  const params = {
    p_surface: String(surface).toLowerCase(),
    p_entity_id: entityId,
    p_plan_code: String(planCode).toLowerCase(),
    p_auto_renew: Boolean(autoRenew),
  };
  // Only send the cadence argument for yearly. Monthly stays a four-argument
  // call so it works whether or not the yearly-billing migration is installed.
  if (interval === "yearly") params.p_billing_interval = "yearly";

  let data;
  try {
    data = await callSubscriptionRpc("change_kunthai_business_plan", params);
  } catch (error) {
    if (interval === "yearly" && unavailableFeature(error)) {
      const friendly = new Error("Yearly billing is being rolled out. Please choose the monthly option for now.");
      friendly.code = "YEARLY_UNAVAILABLE";
      throw friendly;
    }
    throw error;
  }
  notifyBusinessPlanUpdated(surface, entityId);
  return normalizeBusinessSubscriptionState(data, surface, entityId);
}

export async function setBusinessPlanAutoRenew(surface, entityId, autoRenew) {
  const data = await callSubscriptionRpc("set_kunthai_business_auto_renew", {
    p_surface: String(surface).toLowerCase(),
    p_entity_id: entityId,
    p_auto_renew: Boolean(autoRenew),
  });
  notifyBusinessPlanUpdated(surface, entityId);
  return normalizeBusinessSubscriptionState(data, surface, entityId);
}

export async function buyOperatorCapacityPack(companyId) {
  const data = await callSubscriptionRpc("buy_kunthai_operator_capacity_pack", {
    p_company_id: companyId,
  });
  notifyBusinessPlanUpdated("urride", companyId);
  return normalizeBusinessSubscriptionState(data, "urride", companyId);
}

export function getCapacityStatus(state, resource, additional = 0) {
  const config = RESOURCE_CONFIG[resource];
  if (!config) throw new Error(`Unknown business capacity resource: ${resource}`);
  const current = Number(state?.usage?.[resource] || 0);
  const limit = numberOrNull(state?.entitlement?.[config.limitKey]);
  const requested = Math.max(0, Number(additional || 0));
  return {
    resource,
    label: config.label,
    current,
    limit,
    additional: requested,
    unlimited: limit === null,
    remaining: limit === null ? null : Math.max(0, limit - current),
    allowed: limit === null || current + requested <= limit,
  };
}

export class BusinessPlanLimitError extends Error {
  constructor({ surface, resource, current, limit, planCode, state } = {}) {
    const label = RESOURCE_CONFIG[resource]?.label || resource || "items";
    const planName = String(planCode || state?.entitlement?.planName || "current");
    super(`Your ${planName} plan allows ${limit} ${label}. You currently use ${current}. Open Plans & capacity to upgrade.`);
    this.name = "BusinessPlanLimitError";
    this.code = "KUNTHAI_PLAN_LIMIT";
    this.surface = surface;
    this.resource = resource;
    this.current = Number(current || 0);
    this.limit = numberOrNull(limit);
    this.planCode = String(planCode || state?.entitlement?.planCode || "free").toLowerCase();
    this.state = state || null;
  }
}

export function parseBusinessPlanError(error) {
  if (error instanceof BusinessPlanLimitError) return error;
  const message = String(error?.message || error?.details || "");
  const match = message.match(/KUNTHAI_PLAN_LIMIT\|([^|]+)\|([^|]+)\|(\d+)\|(\d+)\|([^\s|]+)/i);
  if (match) {
    return new BusinessPlanLimitError({
      surface: match[1],
      resource: match[2],
      current: Number(match[3]),
      limit: Number(match[4]),
      planCode: match[5],
    });
  }
  const parsed = new Error(error?.message || "Unable to update the business plan.");
  parsed.code = error?.code || "BUSINESS_PLAN_ERROR";
  parsed.details = error?.details;
  parsed.hint = error?.hint;
  return parsed;
}

export async function assertBusinessCapacity(surface, entityId, resource, additional = 1) {
  const state = await fetchBusinessSubscription(surface, entityId);
  // Compatibility during rollout: until the migration is installed, do not
  // invent a quota on the client and break a previously working action.
  if (!state.available) return { allowed: true, unavailable: true, state };
  const capacity = getCapacityStatus(state, resource, additional);
  if (!capacity.allowed) {
    throw new BusinessPlanLimitError({
      surface,
      resource,
      current: capacity.current,
      limit: capacity.limit,
      planCode: state.entitlement.planCode,
      state,
    });
  }
  return { ...capacity, state };
}

export function notifyBusinessPlanUpdated(surface, entityId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BUSINESS_PLAN_UPDATED_EVENT, {
    detail: { surface: String(surface || "").toLowerCase(), entityId },
  }));
}

export function formatBusinessPlanDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

