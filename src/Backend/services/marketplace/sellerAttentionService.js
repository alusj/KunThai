import supabase from "../../lib/supabaseClient";
import { isProductBusinessKind } from "./marketplaceBusinessKinds";
import { calculateReadinessScore, readRegisteredBusiness } from "./sellerRegistrationService";

export async function fetchSellerAttentionItems() {
  const registeredBusiness = await readRegisteredBusiness();

  if (!registeredBusiness) {
    return [];
  }

  const items = [];
  const readinessScore = calculateReadinessScore(registeredBusiness);
  // Only retail and vendor businesses list marketplace_products. Restaurants,
  // hotels and property agents keep their inventory in their own editors, so
  // a product count would never clear for them: they get no such item.
  const usesProducts = isProductBusinessKind(registeredBusiness.businessKind);
  const { count: productCount } = usesProducts
    ? await supabase
      .from("marketplace_products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", registeredBusiness.id)
    : { count: null };

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

  if (usesProducts && !productCount) {
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
