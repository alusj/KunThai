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

const GLOBAL_SOCIAL_FEATURES = Object.freeze({
  explore: true,
  urfeed: true,
  swip: true,
  direct_messages: true,
  voice_notes: true,
  media_uploads: true,
  your_say: true,
  urmall: false,
  seller_registration: false,
  transport_booking: false,
  driver_registration: false,
  company_registration: false,
  adverts: false,
  phone_authentication: false,
  emergency_assistance: false,
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
    urmall: `UrMall is currently available in selected regions. ${countryName} can be enabled when local marketplace rules are ready.`,
    seller_registration: `Seller registration is not yet available in ${countryName}.`,
    transport_booking: `UrRide transport services are not yet available in ${countryName}.`,
    driver_registration: `UrRide driver registration is not yet available in ${countryName}.`,
    company_registration: `UrRide company registration is not yet available in ${countryName}.`,
    adverts: `Advertising is not yet available in ${countryName}.`,
    phone_authentication: `Phone verification is not currently supported for ${countryName}.`,
    emergency_assistance: `Emergency information for ${countryName} has not been verified yet.`,
  };

  return messages[featureKey] || `This feature is coming soon in ${countryName}.`;
}
