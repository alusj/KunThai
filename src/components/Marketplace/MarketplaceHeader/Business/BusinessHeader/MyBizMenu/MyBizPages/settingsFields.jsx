import { GLOBAL_COUNTRY_PROFILES } from "../../../../../../../data/globalCountryProfiles";
import { useI18n, t } from "../../../../../../../i18n";

// Country picker for the seller settings pages: the supported countries, as
// in the registration wizard, instead of free text (see settingsContact.js).
export function CountrySelect({ value, onChange, className }) {
  useI18n();
  return (
    <select
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete="country-name"
    >
      {!value ? <option value="">{t("sellerFix.chooseCountry")}</option> : null}
      {GLOBAL_COUNTRY_PROFILES.map((country) => (
        <option key={country.iso2} value={country.name}>{country.name}</option>
      ))}
    </select>
  );
}
