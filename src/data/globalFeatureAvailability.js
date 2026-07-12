import { getActiveCountryProfile, normalizeCountryIso } from "./globalCountryProfiles";

export const GLOBAL_FEATURE_KEYS = Object.freeze([
  "explore",
  "urfeed",
  "swip",
  "direct_messages",
  "voice_notes",
  "media_uploads",
  "your_say",
  "urmall",
  "seller_registration",
  "transport_booking",
  "driver_registration",
  "company_registration",
  "adverts",
  "phone_authentication",
  "emergency_assistance",
]);

const EXISTING_MARKET_COUNTRIES = new Set([
  "SL", "NG", "GH", "LR", "GN", "CI", "SN", "GM", "ML", "BF", "BJ", "TG", "NE", "GW", "CV", "MR",
]);

// Offline/first-paint fallback only. The database rows in
// kunthai_country_feature_settings are the source of truth and are hydrated
// onto each profile's `features` by countryConfigService, which overrides
// these defaults per country.
const GLOBAL_SOCIAL_FEATURES = Object.freeze({
  explore: true,
  urfeed: true,
  swip: true,
  direct_messages: true,
  voice_notes: true,
  media_uploads: true,
  your_say: true,
  urmall: true,
  seller_registration: true,
  transport_booking: true,
  driver_registration: true,
  company_registration: true,
  adverts: true,
  phone_authentication: true,
  emergency_assistance: true,
});

const EXISTING_MARKET_FEATURES = Object.freeze({
  ...GLOBAL_SOCIAL_FEATURES,
  urmall: true,
  seller_registration: true,
  transport_booking: true,
  driver_registration: true,
  company_registration: true,
  adverts: true,
  phone_authentication: true,
  emergency_assistance: true,
});

function profileForContext(context = {}) {
  return getActiveCountryProfile(
    context.countryCode ||
      context.countryIso ||
      context.country_iso ||
      context.country ||
      context,
  );
}

export function getCountryFeatureAvailability(context = {}) {
  const profile = profileForContext(context);
  const iso2 = normalizeCountryIso(profile);
  const baseFeatures = EXISTING_MARKET_COUNTRIES.has(iso2)
    ? EXISTING_MARKET_FEATURES
    : GLOBAL_SOCIAL_FEATURES;

  return {
    country: profile,
    features: {
      ...baseFeatures,
      ...(profile.features || {}),
    },
  };
}

export function isFeatureAvailable(featureKey, context = {}) {
  const { features } = getCountryFeatureAvailability(context);
  return Boolean(features?.[featureKey]);
}

export function getUnavailableFeatureMessage(featureKey, context = {}) {
  const { country } = getCountryFeatureAvailability(context);
  const countryName = country?.name || "your country";

  const messages = {
    urmall: `UrMall is available globally, but local compliance settings for ${countryName} may still need review.`,
    seller_registration: `Seller registration is available globally, but local compliance settings for ${countryName} may still need review.`,
    transport_booking: `UrRide is available globally, but fleet types can vary by country.`,
    driver_registration: `UrRide driver registration is available globally, but accepted fleet types can vary by country.`,
    company_registration: `UrRide company registration is available globally, but accepted fleet types can vary by country.`,
    adverts: `Advertising is not yet available in ${countryName}.`,
    phone_authentication: `Phone verification is not currently supported for ${countryName}.`,
    emergency_assistance: `Emergency assistance is available globally. Confirm local numbers before dispatching help in ${countryName}.`,
  };

  return messages[featureKey] || `This feature is coming soon in ${countryName}.`;
}
