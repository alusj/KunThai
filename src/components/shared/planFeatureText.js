import { t, uiText } from "../../i18n/index";

// Plan feature lines arrive in English from kunthai_business_plans (and the
// fallback catalogue). Known UrMall lines are shown in the reader's language;
// anything else goes through the shared display-text lookup unchanged.
const URMALL_FEATURE_KEYS = Object.freeze({
  "5 active products, meals or properties": "listingsFree",
  "Up to 30 active products, meals or properties": "listingsPro",
  "Unlimited active products, meals or properties": "listingsPremium",
  "Restaurant meals on up to 5 days a week": "mealsFiveDays",
  "Restaurant meals all 7 days": "mealsAllDays",
  "Seller dashboard": "sellerDashboard",
  "Customer messages": "customerMessages",
  "Store analytics": "storeAnalytics",
  "1 business admin": "oneAdmin",
  "Advanced product insights": "productInsights",
  "Priority store tools": "priorityTools",
  "Up to 5 business admins": "fiveAdmins",
  "Full business insights": "fullInsights",
  "Premium store tools": "premiumTools",
  "1 business type": "typesOne",
  "2 business types": "typesTwo",
  "All 4 business types": "typesAll",
});

export function planFeatureKey(feature) {
  return URMALL_FEATURE_KEYS[String(feature || "")] || "";
}

export function translatePlanFeature(feature) {
  const key = planFeatureKey(feature);
  return key ? t(`urmallPlans2026.features.${key}`) : uiText(feature);
}
