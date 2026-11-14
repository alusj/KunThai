import { normalizeCountryIso } from "../../data/globalCountryProfiles.js";

// Area View places operators from their live location rows, but the vehicle
// and the country belong to the operator's fleet. A location row carries no
// reliable country (the app never writes one) and its type can lag behind the
// fleet, so an operator listed under "Available near you" (which reads the
// fleet) could be missing from the map or drawn as the wrong vehicle. These
// helpers apply the same rule as "Available near you": the operator shows when
// they have an active fleet, visible to passengers, in the passenger's country,
// and the marker is that fleet's vehicle.

const MAP_TYPE_BY_FLEET_TYPE = Object.freeze({
  motorcycle: "bike",
  motorbike: "bike",
  bike: "bike",
  okada: "bike",
  tricycle: "keke",
  keke: "keke",
  car: "car",
  taxi: "car",
  van: "van",
  bus: "van",
  minibus: "van",
});

export function mapTypeForFleetType(fleetType = "") {
  return MAP_TYPE_BY_FLEET_TYPE[String(fleetType || "").trim().toLowerCase()] || "";
}

// Same visibility as transport_available_operators_nearby: an active fleet,
// and a company fleet only when the company shows it to passengers.
export function isFleetShownToPassengers(fleet = {}) {
  if (String(fleet.active_status || "").trim().toLowerCase() !== "active") return false;
  if (fleet.company_id && !fleet.is_visible_to_passengers) return false;
  return true;
}

// rows: transport_fleets rows with transport_operators.user_id embedded.
// Returns Map(operator user id -> that operator's fleets).
export function groupFleetsByOperatorUser(rows = []) {
  const byUser = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const owner = Array.isArray(row?.transport_operators) ? row.transport_operators[0] : row?.transport_operators;
    const userId = owner?.user_id ? String(owner.user_id) : "";
    if (!userId) continue;
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId).push(row);
  }
  return byUser;
}

// operators: normalized Area View operators (id = operator user id).
// fleetsByUser: from groupFleetsByOperatorUser, or null when the fleets could
// not be read at all; then only the location row's own country can place
// an operator, as before.
export function applyOperatorFleets(operators = [], fleetsByUser = null, countryIso = "") {
  const country = normalizeCountryIso(countryIso);
  const placed = [];

  for (const operator of Array.isArray(operators) ? operators : []) {
    if (!operator?.id) continue;
    const rowCountryMatches = !country || normalizeCountryIso(operator.countryCode) === country;

    if (!fleetsByUser) {
      if (rowCountryMatches) placed.push(operator);
      continue;
    }

    const fleets = fleetsByUser.get(String(operator.id)) || [];
    if (!fleets.length) {
      // No fleet this passenger can read: keep the old rule.
      if (rowCountryMatches) placed.push(operator);
      continue;
    }

    const eligible = fleets.filter((fleet) =>
      isFleetShownToPassengers(fleet) &&
      (!country || normalizeCountryIso(fleet.country_iso) === country) &&
      mapTypeForFleetType(fleet.fleet_type),
    );
    if (!eligible.length) continue;

    // Several fleets: the one matching what the operator is sharing, else the first.
    const fleet = eligible.find((item) => mapTypeForFleetType(item.fleet_type) === operator.type) || eligible[0];
    placed.push({
      ...operator,
      type: mapTypeForFleetType(fleet.fleet_type),
      countryCode: normalizeCountryIso(fleet.country_iso) || operator.countryCode,
      fleetId: fleet.id || operator.fleetId || null,
    });
  }

  return placed;
}
