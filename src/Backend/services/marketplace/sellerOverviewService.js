import { calculateReadinessScore, readRegisteredBusiness } from "./sellerRegistrationService";

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "KT";
}

export async function fetchSellerOverview() {
  const registeredBusiness = await readRegisteredBusiness();

  if (!registeredBusiness) {
    return null;
  }

  const score = calculateReadinessScore(registeredBusiness);
  const verified = Boolean(
    registeredBusiness.trustPayout.idDocumentName ||
      registeredBusiness.trustPayout.businessDocumentName,
  );

  return {
    business: {
      name: registeredBusiness.identity.businessName,
      category: registeredBusiness.identity.categories.join(", "),
      location: [registeredBusiness.location.city, registeredBusiness.location.country].filter(Boolean).join(", "),
      logoInitials: getInitials(registeredBusiness.identity.businessName),
      logoUrl: registeredBusiness.identity.logoUrl,
      bannerUrl: registeredBusiness.identity.bannerUrl,
      verified,
      verificationLabel: verified ? "Verified Seller" : "Verification Pending",
      rating: 0,
      reviewCount: 0,
    },
    storeStatus: {
      open: true,
      deliveryEnabled: registeredBusiness.operations.deliveryEnabled,
      pickupEnabled: registeredBusiness.operations.pickupEnabled,
    },
    health: {
      score,
      label: "Store setup",
      nextStep: score >= 100 ? "Your setup is complete." : "Add the remaining business details to improve trust.",
    },
    today: {
      orders: 0,
      revenue: 0,
      pendingMessages: 0,
      lowStockAlerts: 0,
    },
  };
}
