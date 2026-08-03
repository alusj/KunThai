// Strict country visibility for UrRide (pure).
//
// This is the single rule that decides which operators, fleets, drivers,
// companies and vehicles a passenger may SEE. It is intentionally stricter than
// the lenient marketplace scoping (filterCountryScopedItems), which falls back
// to neighbouring countries. For transport and safety we must never do that:
//
//   * the user's current country is a HARD boundary, not a ranking signal;
//   * a foreign operator that is physically closer is EXCLUDED, not down-ranked;
//   * an operator with a missing/invalid country_code is EXCLUDED until it is
//     validated — it must not leak into normal nearby results;
//   * cross-border operators are excluded from ordinary results and only
//     surface through the explicit Cross-Border mode.
//
// Country comparison is always on normalized ISO-2 codes, never free-text names.

import { normalizeCountryIso } from "../../../data/globalCountryProfiles.js";

// Pull the operator's country ISO from whichever field shape it carries.
export function operatorCountryIso(operator) {
  if (!operator) return "";
  return normalizeCountryIso(
    operator.countryCode ||
      operator.country_code ||
      operator.countryIso ||
      operator.country_iso ||
      operator.country,
  );
}

function isTruthyFlag(value) {
  if (value === true) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "yes" || text === "1" || text === "enabled";
}

function approvedList(operator, field) {
  const raw = operator?.[field];
  const values = Array.isArray(raw)
    ? raw
    : String(raw ?? "")
        .split(/[,\s]+/)
        .filter(Boolean);
  return values.map(normalizeCountryIso).filter(Boolean);
}

// Is this operator genuinely cross-border ENABLED (not merely nearby)?
export function isCrossBorderOperator(operator) {
  return isTruthyFlag(operator?.crossBorderEnabled ?? operator?.cross_border_enabled);
}

// Strict same-country filter for the NORMAL UrRide experience.
//
// Returns { items, excluded } where:
//   items    - operators whose country_code === currentCountryIso AND that are
//              not cross-border-only records (a cross-border operator physically
//              based in the current country still shows locally);
//   excluded - a breakdown for diagnostics/telemetry:
//              { missingCountry, foreignCountry }
//
// When currentCountryIso is empty/invalid we return NOTHING for `items` — a
// caller with no confirmed country must show the empty/confirm state, never a
// full unscoped list.
export function filterStrictSameCountry(operators, currentCountryIso) {
  const source = Array.isArray(operators) ? operators : [];
  const current = normalizeCountryIso(currentCountryIso);

  const missingCountry = [];
  const foreignCountry = [];
  const items = [];

  for (const operator of source) {
    const iso = operatorCountryIso(operator);
    if (!iso) {
      missingCountry.push(operator);
      continue;
    }
    if (!current || iso !== current) {
      if (current) foreignCountry.push(operator);
      continue;
    }
    items.push(operator);
  }

  return { items, excluded: { missingCountry, foreignCountry } };
}

// Cross-border eligibility for a specific requested international route.
//
// A foreign operator may be offered in Cross-Border mode ONLY when every
// product/legal precondition is satisfied. Anything short of that keeps the
// operator hidden — proximity alone never qualifies it.
export function isEligibleForCrossBorderRoute(operator, { originIso, destinationIso } = {}) {
  const origin = normalizeCountryIso(originIso);
  const destination = normalizeCountryIso(destinationIso);
  if (!origin || !destination || origin === destination) return false;
  if (!isCrossBorderOperator(operator)) return false;

  const operatorIso = operatorCountryIso(operator);
  if (!operatorIso) return false;

  // The operator must be legally permitted on BOTH ends of the route.
  const approvedOrigins = approvedList(operator, "approvedOriginCountries").length
    ? approvedList(operator, "approvedOriginCountries")
    : approvedList(operator, "approved_origin_countries");
  const approvedDestinations = approvedList(operator, "approvedDestinationCountries").length
    ? approvedList(operator, "approvedDestinationCountries")
    : approvedList(operator, "approved_destination_countries");

  if (!approvedOrigins.includes(origin)) return false;
  if (!approvedDestinations.includes(destination)) return false;

  // Documentation / licensing must be in good standing.
  const license = String(
    operator.operatingLicenseStatus ?? operator.operating_license_status ?? "",
  )
    .trim()
    .toLowerCase();
  if (license && !["approved", "valid", "active", "verified"].includes(license)) return false;

  return true;
}

// Select the operators that may appear for an explicit Cross-Border request.
export function filterCrossBorderRoute(operators, route) {
  const source = Array.isArray(operators) ? operators : [];
  return source.filter((operator) => isEligibleForCrossBorderRoute(operator, route));
}
