import supabase from "../../lib/supabaseClient";
import { isMissingColumn } from "../explore/errors";
import { readRegisteredBusiness } from "./sellerRegistrationService";

export async function fetchSellerActivities() {
  const business = await readRegisteredBusiness();
  if (!business) return [];

  const { data, error } = await supabase
    .from("marketplace_activities")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) throw new Error(error.message);

  return (data || []).filter((activity) => !activity.dismissed_at).map((activity) => ({
    id: activity.id,
    type: activity.activity_type,
    title: activity.title,
    description: activity.description,
    time: new Date(activity.created_at).toLocaleDateString(),
    status: activity.status,
    meta: activity.meta,
    actionLabel: activity.action_label,
    actionTarget: activity.action_target,
    productId: activity.product_id,
    dismissedAt: activity.dismissed_at,
  }));
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
