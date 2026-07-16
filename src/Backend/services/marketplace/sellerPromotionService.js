import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";
import {
  MINIMUM_VERIFIED_INVITES,
  buildInviteUrl,
  buildShareMessage,
  calculateMarketplacePromotionCost,
  ensureVisibilityWallet,
  normalizeInviteGoal,
} from "../visibilityCreditService";

function isActivePromotion(promotion = {}) {
  const endsAt = promotion.ends_at ? new Date(promotion.ends_at).getTime() : 0;
  const withinViews = !promotion.view_limit || Number(promotion.views || 0) < Number(promotion.view_limit || 0);
  return promotion.status === "active" && (!endsAt || endsAt > Date.now()) && withinViews;
}

function mapTask(row) {
  if (!row?.code) return null;
  const inviteUrl = buildInviteUrl(row.code);
  return {
    id: row.id,
    code: row.code,
    inviteUrl,
    requiredInvites: Number(row.required_invites || MINIMUM_VERIFIED_INVITES),
    verifiedInvites: Number(row.verified_invites || 0),
    status: row.status || "active",
    shareMessage: buildShareMessage({
      inviteUrl,
      inviteGoal: row.required_invites,
      surface: row.surface === "urmall_promotion" ? "KunThai UrMall" : "KunThai",
    }),
  };
}

function mapPromotion(promotion, task = null) {
  const creditCost = Number(promotion.credit_cost || promotion.budget_limit || 0);
  const views = Number(promotion.views || 0);
  const viewLimit = promotion.view_limit ? Number(promotion.view_limit) : null;
  const requiredInvites = Number(promotion.required_invites || MINIMUM_VERIFIED_INVITES);
  const verifiedInvites = Number(promotion.verified_invites || task?.verifiedInvites || 0);
  const status = promotion.status || (isActivePromotion(promotion) ? "active" : "pending_task");

  return {
    id: promotion.id,
    productId: promotion.product_id || "",
    name: promotion.name,
    productName: promotion.product_name,
    discountLabel: promotion.discount_label || "Visibility boost",
    reachScope: promotion.reach_scope || "nearby",
    audienceType: promotion.audience_type || "general",
    targetArea: promotion.target_area || "",
    durationDays: Number(promotion.duration_days || 0),
    startsAt: promotion.starts_at || null,
    endsAt: promotion.ends_at || null,
    endsIn: promotion.ends_at ? new Date(promotion.ends_at).toLocaleDateString() : "Pending unlock",
    status,
    active: isActivePromotion(promotion),
    creditCost,
    creditsSpent: Number(promotion.credits_spent || 0),
    creditsNeeded: Math.max(0, creditCost - Number(promotion.credits_spent || 0)),
    requiredInvites,
    verifiedInvites,
    task,
    viewLimit,
    views,
    orders: Number(promotion.orders || 0),
    revenue: Number(promotion.revenue || 0),
  };
}

async function fetchPromotionTasks(promotions) {
  const linkIds = [...new Set((promotions || []).map((item) => item.referral_link_id).filter(Boolean))];
  if (!linkIds.length) return new Map();

  const { data, error } = await supabase
    .from("referral_invite_links")
    .select("*")
    .in("id", linkIds);

  if (error) return new Map();
  return new Map((data || []).map((row) => [row.id, mapTask(row)]));
}

export async function fetchSellerPromotions() {
  const [business, wallet] = await Promise.all([
    readRegisteredBusiness(),
    ensureVisibilityWallet("urmall").catch(() => ({ balance: 0 })),
  ]);
  if (!business) return null;

  const { data, error } = await supabase
    .from("marketplace_promotions")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const taskMap = await fetchPromotionTasks(data || []);
  const promotions = (data || []).map((promotion) => mapPromotion(promotion, taskMap.get(promotion.referral_link_id)));
  const activePromotions = promotions.filter((promotion) => promotion.active);
  const pendingTasks = promotions.filter((promotion) => !promotion.active && promotion.status !== "completed");

  return {
    wallet,
    activePromotions,
    pendingTasks,
    suggestedProducts: [],
    performance: {
      creditsSpent: promotions.reduce((sum, item) => sum + item.creditsSpent, 0),
      activeCredits: activePromotions.reduce((sum, item) => sum + item.creditCost, 0),
      pendingCredits: pendingTasks.reduce((sum, item) => sum + item.creditCost, 0),
      viewsFromPromotions: activePromotions.reduce((sum, item) => sum + item.views, 0),
      ordersFromPromotions: activePromotions.reduce((sum, item) => sum + item.orders, 0),
      discountRevenue: activePromotions.reduce((sum, item) => sum + item.revenue, 0),
    },
    opportunities: [],
  };
}

export async function createMarketplaceProductPromotion(product, options = {}) {
  if (!product?.id) throw new Error("Choose a product before promoting.");

  const durationDays = Math.max(1, Number(options.durationDays || 3));
  const reachScope = options.reachScope || "nearby";
  const audienceType = options.audienceType || "general";
  const viewGoal = Number(options.viewGoal || 0);
  const creditCost = calculateMarketplacePromotionCost({
    audienceType,
    durationDays,
    reachScope,
    viewGoal,
  });
  const requiredInvites = normalizeInviteGoal(options.requiredInvites || Math.max(MINIMUM_VERIFIED_INVITES, creditCost));

  const { data, error } = await supabase.rpc("create_marketplace_promotion_campaign", {
    p_product_id: product.id,
    p_duration_days: durationDays,
    p_reach_scope: reachScope,
    p_audience_type: audienceType,
    p_target_area: options.targetArea || "",
    p_view_limit: viewGoal > 0 ? viewGoal : null,
    p_required_credits: creditCost,
    p_required_invites: requiredInvites,
  });

  if (error) throw new Error(error.message);

  const promotion = data?.promotion ? mapPromotion(data.promotion, mapTask(data.task)) : null;
  window.dispatchEvent(new CustomEvent("marketplace-products-updated"));
  return {
    status: data?.status || promotion?.status || "pending_task",
    promotion,
    wallet: data?.wallet || null,
    task: mapTask(data?.task),
    creditsNeeded: Number(data?.creditsNeeded || 0),
    creditCost,
    requiredInvites,
  };
}

export async function recordMarketplacePromotionView(promotionId) {
  if (!promotionId) return false;
  const { error } = await supabase.rpc("record_marketplace_promotion_view", {
    p_promotion_id: promotionId,
  });
  return !error;
}
