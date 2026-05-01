import supabase from "../../lib/supabaseClient";
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

  return (data || []).map((activity) => ({
    id: activity.id,
    type: activity.activity_type,
    title: activity.title,
    description: activity.description,
    time: new Date(activity.created_at).toLocaleDateString(),
    status: activity.status,
    meta: activity.meta,
    actionLabel: activity.action_label,
  }));
}
