import { getActiveCountryProfile } from "../../../../../data/westAfricanCountryProfiles";

export default function BusinessName() {
  const countryProfile = getActiveCountryProfile();

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900">Jay Electronics</h2>
      <p className="text-sm text-gray-500">Electronics - {countryProfile.name}</p>
    </div>
  );
}
