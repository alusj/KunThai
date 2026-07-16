import supabase from "../../lib/supabaseClient";
import { calculateReadinessScore, readRegisteredBusiness } from "./sellerRegistrationService";

export async function fetchSellerAttentionItems() {
  const registeredBusiness = await readRegisteredBusiness();

  if (!registeredBusiness) {
    return [];
  }

  const items = [];
  const readinessScore = calculateReadinessScore(registeredBusiness);
  const { count: productCount } = await supabase
    .from("marketplace_products")
    .select("id", { count: "exact", head: true })
    .eq("business_id", registeredBusiness.id);

  if (readinessScore < 100) {
    items.push({
      id: "profile-incomplete",
      type: "profile",
      title: "Store profile incomplete",
      description: "Finish the remaining setup details to improve buyer trust.",
      count: 1,
      priority: "medium",
      actionLabel: "Complete setup",
      dueLabel: `${readinessScore}% complete`,
    });
  }

  if (!productCount) {
    items.push({
      id: "add-first-product",
      type: "inventory",
      title: "Add your first product",
      description: "Your store is registered. Add products so buyers can start ordering.",
      count: 1,
      priority: "high",
      actionLabel: "Add product",
      dueLabel: "Next step",
    });
  }

  return items;
}
