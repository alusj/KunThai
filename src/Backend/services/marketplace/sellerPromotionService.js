import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";

export async function fetchSellerPromotions() {
  const business = await readRegisteredBusiness();
  if (!business) return null;

  const { data, error } = await supabase
    .from("marketplace_promotions")
    .select("*")
    .eq("business_id", business.id)
    .eq("status", "active")
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const activePromotions = (data || []).map((promotion) => {
    const metadata = promotion.metadata && typeof promotion.metadata === "object" ? promotion.metadata : {};
    return {
      id: promotion.id,
      name: promotion.name,
      productName: promotion.product_name,
      discountLabel: promotion.discount_label,
      endsIn: promotion.ends_at ? new Date(promotion.ends_at).toLocaleDateString() : "No end date",
      budgetSpent: Number(promotion.budget_spent || 0),
      budgetLimit: Number(promotion.budget_limit || 0),
      creditBudget: Number(promotion.credit_budget || promotion.budget_limit || 0),
      creditsSpent: Number(promotion.credits_spent || promotion.budget_limit || 0),
      audienceType: metadata.audienceType || "countrywide",
      durationDays: Number(metadata.durationDays || 0),
      views: promotion.views,
      orders: promotion.orders,
      revenue: Number(promotion.revenue || 0),
    };
  });

  return {
    activePromotions,
    suggestedProducts: [],
    performance: {
      budgetSpent: activePromotions.reduce((sum, item) => sum + item.creditsSpent, 0),
      viewsFromPromotions: activePromotions.reduce((sum, item) => sum + item.views, 0),
      ordersFromPromotions: activePromotions.reduce((sum, item) => sum + item.orders, 0),
      discountRevenue: activePromotions.reduce((sum, item) => sum + item.revenue, 0),
    },
    opportunities: [],
  };
}
