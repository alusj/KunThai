import { calculateReadinessScore, readRegisteredBusiness } from "./sellerRegistrationService";

export async function fetchSellerAttentionItems() {
  const registeredBusiness = await readRegisteredBusiness();

  if (!registeredBusiness) {
    return [];
  }

  const items = [];
  const readinessScore = calculateReadinessScore(registeredBusiness);

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

  if (registeredBusiness.trustPayout.skipped) {
    items.push({
      id: "payout-setup-needed",
      type: "payout",
      title: "Payout setup skipped",
      description: "Add KunThai Money or bank details before your first withdrawal.",
      count: 1,
      priority: "medium",
      actionLabel: "Add payout",
      dueLabel: "Before first sale",
    });
  }

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

  return items;
}
