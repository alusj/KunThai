import { normalizeCountryIso, storeCountryContext } from "../../data/westAfricanCountryProfiles";

export async function detectCountryFromCoords(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !mapTilerKey) {
    return null;
  }

  try {
    const res = await fetch(
      `https://api.maptiler.com/geocoding/${longitude},${latitude}.json?key=${mapTilerKey}`,
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();

    const countryFeature = data?.features?.find((f) =>
      f?.place_type?.includes("country")
    );

    const countryCode = String(countryFeature?.properties?.country_code || "").toUpperCase() || "";
    const westAfricaCountryCode = normalizeCountryIso(countryCode);
    if (westAfricaCountryCode) storeCountryContext(westAfricaCountryCode);

    return {
      countryCode,
      countryName: countryFeature?.text,
    };
  } catch {
    return null;
  }
}
