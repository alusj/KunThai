import supabase from "../../lib/supabaseClient";
import { isMissingColumn } from "../explore/errors";
import { readRegisteredBusiness } from "./sellerRegistrationService";

const PROMOTION_EXPIRY_WARNING_MS = 3 * 24 * 60 * 60 * 1000;
const PROMOTION_HISTORY_MS = 45 * 24 * 60 * 60 * 1000;
const PROMOTION_STARTED_VISIBILITY_MS = 7 * 24 * 60 * 60 * 1000;

function formatActivityDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function buildPromotionLifecycleActivities(promotions = []) {
  const now = Date.now();
  const activities = [];

  promotions.forEach((promotion) => {
    const name = promotion.product_name || promotion.name || "Product";
    const startedAt = promotion.starts_at || promotion.created_at;
    const endsAt = promotion.ends_at || null;
    const endTime = endsAt ? new Date(endsAt).getTime() : Infinity;
    const startTime = new Date(startedAt || 0).getTime();
    const productId = promotion.product_id || null;
    const productActionLabel = productId ? "View product" : null;
    const insightsActionLabel = productId ? "View insights" : null;

    if (Number.isFinite(startTime) && startTime <= now && now - startTime <= PROMOTION_STARTED_VISIBILITY_MS) {
      activities.push({
        id: `promotion-started:${promotion.id}`,
        type: "promotion",
        title: "Promotion started",
        description: `${name} is now being promoted to more buyers.`,
        time: formatActivityDate(startedAt),
        createdAt: startedAt,
        sortTimestamp: startTime,
        status: "active",
        meta: endsAt ? `Ends ${formatActivityDate(endsAt)}` : "Active campaign",
        actionLabel: productActionLabel,
        actionTarget: productId ? "seller-product-detail" : null,
        productId,
        synthetic: true,
        dismissible: false,
      });
    }

    if (!Number.isFinite(endTime)) return;
    if (endTime <= now) {
      activities.push({
        id: `promotion-expired:${promotion.id}:${endsAt}`,
        type: "promotion",
        title: "Promotion ended",
        description: `${name} has completed its promotion window. Review the product insights to see the results.`,
        time: formatActivityDate(endsAt),
        createdAt: endsAt,
        sortTimestamp: endTime,
        status: "completed",
        meta: "Campaign completed",
        actionLabel: insightsActionLabel,
        actionTarget: productId ? "seller-product-insights" : null,
        productId,
        synthetic: true,
        dismissible: false,
      });
      return;
    }

    if (endTime - now <= PROMOTION_EXPIRY_WARNING_MS) {
      const warningAt = new Date(endTime - PROMOTION_EXPIRY_WARNING_MS).toISOString();
      const hoursRemaining = Math.max(1, Math.ceil((endTime - now) / (60 * 60 * 1000)));
      const remainingLabel = hoursRemaining < 24
        ? `${hoursRemaining} hour${hoursRemaining === 1 ? "" : "s"}`
        : `${Math.ceil(hoursRemaining / 24)} day${Math.ceil(hoursRemaining / 24) === 1 ? "" : "s"}`;
      activities.push({
        id: `promotion-expiring:${promotion.id}:${endsAt}`,
        type: "promotion",
        title: "Promotion ending soon",
        description: `${name} will stop being promoted in about ${remainingLabel}.`,
        time: formatActivityDate(warningAt),
        createdAt: warningAt,
        sortTimestamp: new Date(warningAt).getTime(),
        status: "warning",
        meta: `Ends ${formatActivityDate(endsAt)}`,
        actionLabel: insightsActionLabel,
        actionTarget: productId ? "seller-product-insights" : null,
        productId,
        synthetic: true,
        dismissible: false,
      });
    }
  });

  return activities;
}

export async function fetchSellerActivities() {
  const business = await readRegisteredBusiness();
  if (!business) return [];

  const historyCutoff = new Date(Date.now() - PROMOTION_HISTORY_MS).toISOString();
  const [activityResult, promotionResult] = await Promise.all([
    supabase
      .from("marketplace_activities")
      .select("*")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("marketplace_promotions")
      .select("*")
      .eq("business_id", business.id)
      .gte("created_at", historyCutoff)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (activityResult.error) throw new Error(activityResult.error.message);

  const persistedActivities = (activityResult.data || []).filter((activity) => !activity.dismissed_at).map((activity) => ({
    id: activity.id,
    type: activity.activity_type,
    title: activity.title,
    description: activity.description,
    time: formatActivityDate(activity.created_at),
    createdAt: activity.created_at,
    sortTimestamp: new Date(activity.created_at || 0).getTime(),
    status: activity.status,
    meta: activity.meta,
    actionLabel: activity.action_label,
    actionTarget: activity.action_target,
    productId: activity.product_id,
    dismissedAt: activity.dismissed_at,
    dismissible: true,
  }));
  const promotionActivities = promotionResult.error
    ? []
    : buildPromotionLifecycleActivities(promotionResult.data || []);

  return [...persistedActivities, ...promotionActivities]
    .sort((a, b) => b.sortTimestamp - a.sortTimestamp)
    .slice(0, 30);
}

export async function dismissSellerActivity(activityId) {
  const business = await readRegisteredBusiness();
  if (!business || !activityId) return;

  const { error } = await supabase
    .from("marketplace_activities")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", activityId)
    .eq("business_id", business.id);

  if (error && isMissingColumn(error, "dismissed_at")) return;
  if (error) throw new Error(error.message);
}
