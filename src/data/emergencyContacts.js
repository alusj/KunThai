import {
  getEmergencyContactsForCountry,
  WEST_AFRICAN_COUNTRY_PROFILES,
} from "./westAfricanCountryProfiles";

export const EMERGENCY_CONTACTS = Object.fromEntries(
  WEST_AFRICAN_COUNTRY_PROFILES.map((profile) => [
    profile.iso2,
    getEmergencyContactsForCountry(profile.iso2),
  ]),
);

export const DEFAULT_EMERGENCY = {
  country: "Unknown location",
  countryCode: "",
  police: ["112", "911"],
  ambulance: ["112", "911"],
  fire: ["112", "911"],
  notes: "Country not detected. Try 112 or 911 if supported by your network, and use nearby police, clinic, or fire station search as a backup.",
};
