// Context-aware SHORT address for product cards.
//
// This decides the compact location string shown on a product card by comparing
// the buyer's location with the seller's normalized structured address. It NEVER
// touches the seller's saved address, coordinates, map marker, or profile — it
// only produces display text for the card.
//
// Rules (see tests for the full example matrix):
//   - Same city  -> most useful local area + city
//       community | neighbourhood -> popularName -> district | suburb -> street -> (city alone)
//   - Different city / unknown buyer -> seller city + country
//       (city missing -> region + country; region missing -> country)
//   - Never a house number or full street address (privacy) — approximate area only.
//   - Never duplicated parts ("Lumley, Lumley", "Freetown, Sierra Leone, Sierra Leone").

import { dedupeAddressParts } from "./geoAddress.js";
import { toFiniteNumber } from "./coordinates.js";

// Small, safe alias maps — NOT an attempt to enumerate every city. Prefer stable
// geocoding identifiers (city place id / admin ids) when both sides supply them.
const CITY_ALIASES = { nyc: "new york" };
const COUNTRY_ALIASES = {
  usa: "united states",
  us: "united states",
  "u s a": "united states",
  america: "united states",
  "united states of america": "united states",
  uk: "united kingdom",
  "u k": "united kingdom",
  "great britain": "united kingdom",
};

function baseKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=_`~()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "Freetown" == "Freetown City"; "New York" == "New York City" == "NYC".
export function normalizeCityKey(city) {
  const key = baseKey(city).replace(/\s+city$/, "");
  return CITY_ALIASES[key] || key;
}

export function normalizeCountryKey(country) {
  const key = baseKey(country);
  return COUNTRY_ALIASES[key] || key;
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

// Privacy: drop a leading house/building number so a public card shows only the
// area. "26a Grassfield Road" -> "Grassfield Road"; "12-14 Wilkinson Rd" -> "Wilkinson Rd".
function stripLeadingHouseNumber(value) {
  return String(value ?? "")
    .replace(/^\s*\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?\s+/, "")
    .trim();
}

// Administrative comparison first (stable ids), then normalized city + country.
// Distance is deliberately NOT used — big cities span wide areas and adjacent
// points can sit in different cities.
export function sameCity(buyerLocation, sellerLocation) {
  const buyer = buyerLocation || {};
  const seller = sellerLocation || {};

  if (buyer.cityPlaceId && seller.cityPlaceId) {
    return String(buyer.cityPlaceId) === String(seller.cityPlaceId);
  }

  const buyerCity = normalizeCityKey(buyer.city);
  const sellerCity = normalizeCityKey(seller.city);
  if (!buyerCity || !sellerCity) return false;

  const buyerCountry = normalizeCountryKey(buyer.country);
  const sellerCountry = normalizeCountryKey(seller.country);
  if (buyerCountry && sellerCountry && buyerCountry !== sellerCountry) return false;

  return buyerCity === sellerCity;
}

export function getProductCardLocation({ buyerLocation, sellerLocation } = {}) {
  const seller = sellerLocation || {};
  const sellerCity = firstText(seller.city);
  const sellerRegion = firstText(seller.region, seller.state);
  const sellerCountry = firstText(seller.country);

  // Join then dedupe at the COMMA-TOKEN level, so a field that already embeds a
  // country (e.g. city = "Lumley, Sierra Leone") never yields "…, Sierra Leone,
  // Sierra Leone".
  const finalize = (parts) => dedupeAddressParts(parts.filter(Boolean).join(", "));

  const differentCityDisplay = () => {
    if (sellerCity) return finalize([sellerCity, sellerCountry]);
    if (sellerRegion) return finalize([sellerRegion, sellerCountry]);
    return finalize([sellerCountry]);
  };

  const buyer = buyerLocation || {};
  // Unknown buyer city (permission denied / undeterminable) -> safe fallback.
  if (!firstText(buyer.city)) return differentCityDisplay();
  if (!sameCity(buyer, seller)) return differentCityDisplay();

  // Same city: prefer the most specific local area the seller actually has.
  let localArea = stripLeadingHouseNumber(
    firstText(
      seller.community,
      seller.neighbourhood,
      seller.popularName,
      seller.district,
      seller.suburb,
      seller.street,
      seller.road,
    ),
  );
  // If the "local area" is really just the city again, drop it (no "New York, New York City").
  if (localArea && normalizeCityKey(localArea) === normalizeCityKey(sellerCity)) localArea = "";

  return finalize([localArea, sellerCity]) || sellerCountry || sellerCity;
}

// Build a normalized sellerLocation from a product/seller/vertical record.
// Uses explicit structured fields when present; otherwise derives the most
// specific local area from the saved (already cleaned) address text — it never
// invents an area, and strips the house number for privacy.
export function buildCardSellerLocation(source = {}) {
  const s = source || {};
  const city = firstText(s.city);
  const country = firstText(s.country);
  const region = firstText(s.region, s.state);
  const popularName = firstText(s.popularName);
  const street = firstText(s.street, s.road);
  let community = firstText(s.community, s.neighbourhood, s.suburb, s.quarter);

  if (!community && !popularName && !street) {
    const text = firstText(s.address, s.location);
    const areaParts = text
      .split(",")
      .map((part) => part.trim())
      .filter((part) => {
        const key = normalizeCityKey(part);
        return key && key !== normalizeCityKey(city) && normalizeCountryKey(part) !== normalizeCountryKey(country);
      });
    community = areaParts.length ? stripLeadingHouseNumber(areaParts[0]) : "";
  }

  return {
    community,
    neighbourhood: "",
    popularName,
    street,
    district: firstText(s.district),
    suburb: "",
    city,
    region,
    country,
    latitude: toFiniteNumber(s.latitude ?? s.lat),
    longitude: toFiniteNumber(s.longitude ?? s.lng),
  };
}
