// Backward-compatible aliases. These exports now contain the complete global
// dialing catalogue; new code should import the GLOBAL_* names directly.
export * from "./globalCountryCodes";

export {
  DEFAULT_GLOBAL_COUNTRY_CODE as DEFAULT_WEST_AFRICAN_COUNTRY_CODE,
  GLOBAL_COUNTRY_CODES as WEST_AFRICAN_COUNTRY_CODES,
} from "./globalCountryCodes";
