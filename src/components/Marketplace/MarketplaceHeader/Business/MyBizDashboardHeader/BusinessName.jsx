import { getActiveCountryProfile } from "../../../../../data/globalCountryProfiles";
import { t as i18nText } from "../../../../../i18n/index";

export default function BusinessName() {
  const countryProfile = getActiveCountryProfile();

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900">{i18nText("ui.literals.k583084378958")}</h2>
      <p className="text-sm text-gray-500">{i18nText("ui.literals.k1629613ba9b5")} {countryProfile.name}</p>
    </div>
  );
}
