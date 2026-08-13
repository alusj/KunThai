import { getActiveCountryProfile } from "../../../../../data/globalCountryProfiles";
import BusinessStatus from "./BusinessStatus";
import EditBusinessButton from "./EditBusinessButton";
import { t as i18nText } from "../../../../../i18n/index";

export default function BusinessIdentity({ onEditProfile }) {
  const countryProfile = getActiveCountryProfile();

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{i18nText("ui.literals.k583084378958")}</h2>
          <p className="text-sm text-gray-500">{i18nText("ui.literals.k1629613ba9b5")} {countryProfile.name}</p>
        </div>

        <BusinessStatus status="open" />
      </div>

      <EditBusinessButton onClick={onEditProfile} />
    </section>
  );
}
