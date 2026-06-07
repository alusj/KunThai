import {
  formatCountryMoney,
  getActiveCountryProfile,
  getCountryCurrencyCode,
} from "../../data/westAfricanCountryProfiles";

export function detectCurrency(country = "") {
  return getCountryCurrencyCode(country);
}

export function formatCurrency(amount, country = "", options = {}) {
  return formatCountryMoney(amount, country || getActiveCountryProfile(), options);
}

export function formatCurrencyCode(country = "") {
  return getCountryCurrencyCode(country);
}
