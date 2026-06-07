import {
  getDefaultCountryProfile,
  WEST_AFRICAN_COUNTRY_PROFILES,
} from "./westAfricanCountryProfiles";

export const WEST_AFRICAN_COUNTRY_CODES = WEST_AFRICAN_COUNTRY_PROFILES.map((profile) => ({
  name: profile.name,
  iso2: profile.iso2,
  dialCode: profile.dialCode,
  flag: profile.flag,
  placeholder: profile.placeholder,
  minLength: profile.minLength,
  maxLength: profile.maxLength,
}));

export const DEFAULT_WEST_AFRICAN_COUNTRY_CODE = {
  name: getDefaultCountryProfile().name,
  iso2: getDefaultCountryProfile().iso2,
  dialCode: getDefaultCountryProfile().dialCode,
  flag: getDefaultCountryProfile().flag,
  placeholder: getDefaultCountryProfile().placeholder,
  minLength: getDefaultCountryProfile().minLength,
  maxLength: getDefaultCountryProfile().maxLength,
};
