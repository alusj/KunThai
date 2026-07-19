// Backward-compatible aliases. These exports now contain the complete global
// country catalogue; new code should import the GLOBAL_* names directly.
export * from "./globalCountryProfiles";

export {
  GLOBAL_COUNTRY_PROFILES as WEST_AFRICAN_COUNTRY_PROFILES,
  GLOBAL_COUNTRY_SELECT_OPTIONS as WEST_AFRICAN_COUNTRY_SELECT_OPTIONS,
} from "./globalCountryProfiles";
