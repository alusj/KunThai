import { Compass, MapPin, Sparkles } from "lucide-react";

import {
  getMarketplacePromotionDurationDays,
  MINIMUM_VISIBILITY_CREDITS,
  normalizeVisibilityCreditSpend,
  VISIBILITY_BOOST_PACKAGES,
} from "../../../../../Backend/services/visibilityCreditService";
import { normalizeRegionSelection } from "../../../../../Backend/services/regions/regionModel";

export const PROMOTION_AUDIENCES = [
  { id: "recommended", icon: Sparkles, labelKey: "audRecommended", descKey: "audRecommendedDesc" },
  { id: "nearby", icon: MapPin, labelKey: "audNearby", descKey: "audNearbyDesc" },
  { id: "countrywide", icon: Compass, labelKey: "audCountrywide", descKey: "audCountrywideDesc" },
];

export function estimatePromotionDays(credits) {
  return getMarketplacePromotionDurationDays(credits);
}

export function normalizePromotionSettings(settings = {}) {
  const promotionCredits = normalizeVisibilityCreditSpend(
    settings.promotionCredits ?? settings.credits,
    MINIMUM_VISIBILITY_CREDITS,
  );
  const matchedPackage = VISIBILITY_BOOST_PACKAGES.find(
    (item) => item.id !== "custom" && item.credits === promotionCredits,
  );
  return {
    promotionCredits,
    promotionCreditPackage: settings.promotionCreditPackage || settings.creditPackage || matchedPackage?.id || "custom",
    promotionAudience: settings.promotionAudience || settings.audience || "recommended",
    // "country" (whole country) or "regions" (only the chosen states/districts).
    promotionRegionMode: settings.promotionRegionMode === "regions" ? "regions" : "country",
    promotionRegions: settings.promotionRegionMode === "regions" ? normalizeRegionSelection(settings.promotionRegions) : [],
  };
}

/** True when the boost's location choice is complete. */
export function promotionRegionsReady(mode, regions) {
  return mode !== "regions" || normalizeRegionSelection(regions).length > 0;
}
