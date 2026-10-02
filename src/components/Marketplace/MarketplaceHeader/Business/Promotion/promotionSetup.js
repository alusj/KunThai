import { Compass, MapPin, Sparkles } from "lucide-react";

import {
  getMarketplacePromotionDurationDays,
  MINIMUM_VISIBILITY_CREDITS,
  normalizeVisibilityCreditSpend,
  VISIBILITY_BOOST_PACKAGES,
} from "../../../../../Backend/services/visibilityCreditService";
import { normalizeRegionSelection } from "../../../../../Backend/services/regions/regionModel";
import { checkPromotionTargeting, normalizeCountrySelection } from "../../../../../Backend/services/regions/promotionTargeting";

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
    // "country" (whole country), "regions" (only the chosen states/districts)
    // or "countries" (several whole countries, from 100 credits).
    promotionRegionMode: ["regions", "countries"].includes(settings.promotionRegionMode) ? settings.promotionRegionMode : "country",
    promotionRegions: settings.promotionRegionMode === "regions" ? normalizeRegionSelection(settings.promotionRegions) : [],
    promotionCountries: settings.promotionRegionMode === "countries" ? normalizeCountrySelection(settings.promotionCountries) : [],
  };
}

/**
 * True when the boost's location choice is complete AND the credits cover it
 * (one area up to 10 credits, one per 5 above, several countries from 100).
 */
export function promotionRegionsReady(mode, regions, { countries = [], credits = null } = {}) {
  const areaCount = mode === "regions" ? normalizeRegionSelection(regions).length : 0;
  const countryCount = mode === "countries" ? normalizeCountrySelection(countries).length : 0;
  if (mode === "regions" && !areaCount) return false;
  if (mode === "countries" && !countryCount) return false;
  if (credits === null || credits === undefined) return true;
  return checkPromotionTargeting({ credits, areas: areaCount, countries: Math.max(1, countryCount) }).ok;
}
