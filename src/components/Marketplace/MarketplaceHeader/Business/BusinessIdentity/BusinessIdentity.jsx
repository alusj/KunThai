import { getActiveCountryProfile } from "../../../../../data/globalCountryProfiles";
import BusinessStatus from "./BusinessStatus";
import EditBusinessButton from "./EditBusinessButton";

export default function BusinessIdentity({ onEditProfile }) {
  const countryProfile = getActiveCountryProfile();

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Jay Electronics</h2>
          <p className="text-sm text-gray-500">Electronics - {countryProfile.name}</p>
        </div>

        <BusinessStatus status="open" />
      </div>

      <EditBusinessButton onClick={onEditProfile} />
    </section>
  );
}
