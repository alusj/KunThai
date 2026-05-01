import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";

export async function fetchSellerPromotions() {
  const business = await readRegisteredBusiness();
  if (!business) return null;

  const { data, error } = await supabase
    .from("marketplace_promotions")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const activePromotions = (data || []).map((promotion) => ({
    id: promotion.id,
    name: promotion.name,
    productName: promotion.product_name,
    discountLabel: promotion.discount_label,
    endsIn: promotion.ends_at ? new Date(promotion.ends_at).toLocaleDateString() : "No end date",
    budgetSpent: Number(promotion.budget_spent || 0),
    budgetLimit: Number(promotion.budget_limit || 0),
    views: promotion.views,
    orders: promotion.orders,
    revenue: Number(promotion.revenue || 0),
  }));

  return {
    activePromotions,
    suggestedProducts: [],
    performance: {
      budgetSpent: activePromotions.reduce((sum, item) => sum + item.budgetSpent, 0),
      viewsFromPromotions: activePromotions.reduce((sum, item) => sum + item.views, 0),
      ordersFromPromotions: activePromotions.reduce((sum, item) => sum + item.orders, 0),
      discountRevenue: activePromotions.reduce((sum, item) => sum + item.revenue, 0),
    },
    opportunities: [],
  };
}
