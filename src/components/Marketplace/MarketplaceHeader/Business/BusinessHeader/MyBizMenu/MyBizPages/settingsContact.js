import { getCountryProfile, validateCountryPhone } from "../../../../../../../data/globalCountryProfiles";
import { normalizeWhatsAppContact } from "../../../../../../../Backend/services/marketplace/whatsappLink";
import { t } from "../../../../../../../i18n";

// Shared by the seller settings pages that edit the store's country and
// contact details. The country drives the business's country code and
// currency, so it must be a supported country (picked with CountrySelect, as
// in the registration wizard): a typo would silently fall back to another.

// The supported country a stored value refers to, or null.
export function findSupportedCountry(value) {
  return value ? getCountryProfile(value) : null;
}

// The form value for a stored country: the supported country's name, or ""
// (so the picker asks for a choice) when it isn't one.
export function countryFormValue(value) {
  return findSupportedCountry(value)?.name || "";
}

// Translated error for the country, phone and WhatsApp fields, or "" when they
// are fine. Only the fields passed are checked; a page that doesn't edit the
// country checks the numbers against the saved one when it is supported.
export function validateContactFields({ country, phone, whatsapp, editsCountry = true } = {}) {
  const profile = findSupportedCountry(country);
  if (!profile && editsCountry) return t("sellerFix.chooseCountry");
  if (profile && phone !== undefined) {
    const phoneValidation = validateCountryPhone(phone, profile);
    if (!phoneValidation.valid) {
      return t("sellerFix.phoneInvalid", { country: profile.name, digits: phoneValidation.expected });
    }
  }
  if (whatsapp !== undefined && !normalizeWhatsAppContact(whatsapp, profile || country).valid) {
    return t("sellerFix.whatsappInvalid");
  }
  return "";
}

// The WhatsApp value to save: links as typed, numbers in full international form.
export function whatsappToSave(whatsapp, country) {
  return normalizeWhatsAppContact(whatsapp, findSupportedCountry(country) || country).value;
}
