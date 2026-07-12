import {
  getDefaultCountryProfile,
  GLOBAL_COUNTRY_PROFILES,
} from "./globalCountryProfiles";

export const GLOBAL_COUNTRY_CODES = GLOBAL_COUNTRY_PROFILES.map((profile) => ({
  name: profile.name,
  iso2: profile.iso2,
  dialCode: profile.dialCode,
  flag: profile.flag,
  placeholder: profile.placeholder,
  minLength: profile.minLength,
  maxLength: profile.maxLength,
}));

export const DEFAULT_GLOBAL_COUNTRY_CODE = {
  name: getDefaultCountryProfile().name,
  iso2: getDefaultCountryProfile().iso2,
  dialCode: getDefaultCountryProfile().dialCode,
  flag: getDefaultCountryProfile().flag,
  placeholder: getDefaultCountryProfile().placeholder,
  minLength: getDefaultCountryProfile().minLength,
  maxLength: getDefaultCountryProfile().maxLength,
};
