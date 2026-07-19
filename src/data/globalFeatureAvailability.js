import { getActiveCountryProfile } from "./globalCountryProfiles";

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

// Offline/first-paint fallback only. The database rows in
// kunthai_country_feature_settings are the source of truth and are hydrated
// onto each profile's `features` by countryConfigService, which overrides
// these defaults per country.
const GLOBAL_FEATURE_DEFAULTS = Object.freeze({
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

  return {
    country: profile,
    features: {
      ...GLOBAL_FEATURE_DEFAULTS,
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
    adverts: `Advertising is available globally, subject to local rules in ${countryName}.`,
    phone_authentication: `Phone verification is available for supported carriers in ${countryName}.`,
    emergency_assistance: `Emergency assistance is available globally. Confirm local numbers before dispatching help in ${countryName}.`,
  };

  return messages[featureKey] || `This feature is coming soon in ${countryName}.`;
}
