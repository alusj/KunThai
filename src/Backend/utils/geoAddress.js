// Address text handling for KunThai.
//
// Reverse geocoding produces DISPLAY TEXT ONLY. It must never change the saved
// coordinates. This module turns provider-specific reverse-geocode fields
// (Nominatim / MapTiler style) into one normalized address object and builds a
// clean, human-recognisable, de-duplicated address string.
//
// Display order prioritises the names local people actually use:
//   community / neighbourhood / suburb / quarter / village / locality
//   -> popular place name
//   -> street / road
//   -> district / town / city / municipality
//   -> region / province
//   -> country

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

// Split an address into parts and drop empties, repeated commas, repeated
// spaces, and case-insensitive duplicate parts (keeping the first occurrence).
// "26a Grassfield,, Lumley, Lumley, Sierra Leone, Sierra Leone"
//   -> "26a Grassfield, Lumley, Sierra Leone"
export function dedupeAddressParts(parts) {
  const list = (Array.isArray(parts) ? parts : String(parts ?? "").split(","))
    // Collapse whitespace and trim stray surrounding punctuation (leftover
    // periods/semicolons from messy source data like "Freetown." or "Lumley.").
    .map((part) => String(part ?? "").replace(/\s+/g, " ").replace(/^[\s.,;]+|[\s.,;]+$/g, "").trim())
    .filter(Boolean);

  const seen = new Set();
  const result = [];
  for (const part of list) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(part);
  }
  return result.join(", ");
}

// Clean a pre-existing messy address string (e.g. one stored earlier from a raw
// provider display_name) for display.
export function cleanAddressString(value) {
  return dedupeAddressParts(String(value ?? "").split(","));
}

// Provider-agnostic normalization. `raw` is the provider's address-components
// object; extra carries the authoritative coordinates + optional display name.
export function normalizeGeocodeAddress(raw = {}, extra = {}) {
  const a = raw || {};

  const community = firstNonEmpty(
    a.neighbourhood,
    a.suburb,
    a.quarter,
    a.residential,
    a.city_block,
    a.hamlet,
    a.village,
    a.locality,
    a.community,
    a.borough,
  );
  const popularName = firstNonEmpty(a.place, a.attraction, a.tourism, a.building, a.amenity, a.shop);
  const street = firstNonEmpty(
    [a.house_number, a.road || a.pedestrian || a.footway || a.street].filter(Boolean).join(" "),
  );
  const district = firstNonEmpty(a.city_district, a.district, a.county, a.state_district);
  const city = firstNonEmpty(a.city, a.town, a.municipality, a.village);
  const region = firstNonEmpty(a.state, a.region, a.province);
  const country = firstNonEmpty(a.country);

  const formattedAddress = dedupeAddressParts([
    community,
    popularName,
    street,
    district,
    city,
    region,
    country,
  ]);

  return {
    community,
    popularName,
    street,
    district,
    city,
    region,
    country,
    latitude: extra.latitude ?? null,
    longitude: extra.longitude ?? null,
    formattedAddress: formattedAddress || String(extra.displayName ?? "").trim(),
  };
}
