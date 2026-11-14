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

    // One marker per active vehicle, as "Available near you" lists one card
    // per vehicle: a company can put the same driver on a tricycle and a
    // taxi, and showing only one of them left the other off the map. The
    // vehicle the driver is sharing from comes first. A single vehicle keeps
    // the operator's own id, so its marker is not rebuilt.
    const ordered = [
      ...eligible.filter((item) => mapTypeForFleetType(item.fleet_type) === operator.type),
      ...eligible.filter((item) => mapTypeForFleetType(item.fleet_type) !== operator.type),
    ];
    for (const fleet of ordered) {
      placed.push({
        ...operator,
        id: ordered.length > 1 && fleet.id ? `${operator.id}:${fleet.id}` : operator.id,
        operatorId: operator.operatorId || operator.id,
        type: mapTypeForFleetType(fleet.fleet_type),
        countryCode: normalizeCountryIso(fleet.country_iso) || operator.countryCode,
        fleetId: fleet.id || operator.fleetId || null,
        companyId: fleet.company_id || "",
      });
    }
  }

  return placed;
}

// Markers that sit on the same spot (one driver with several vehicles, or
// operators a few metres apart) cover each other. Each gets a sideways pixel
// offset, centred on the spot, so all of them show and can be tapped at any
// zoom. Returns Map(id -> [x, y]); a marker on its own is [0, 0].
export const MARKER_FAN_STEP_PX = 58;

export function markerFanOffsets(operators = [], { step = MARKER_FAN_STEP_PX, precision = 4 } = {}) {
  const offsets = new Map();
  for (const [id, steps] of fanSteps(operators, precision)) offsets.set(id, [Math.round(steps * step), 0]);
  return offsets;
}

// Map(id -> sideways position in steps, centred: -0.5 / 0.5 for a pair).
function fanSteps(operators = [], precision = 4) {
  const groups = new Map();
  for (const operator of Array.isArray(operators) ? operators : []) {
    const lat = Number(operator?.lat);
    const lng = Number(operator?.lng);
    if (!operator?.id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(String(operator.id));
  }
  const steps = new Map();
  for (const ids of groups.values()) {
    // Stable order whatever order the rows arrived in.
    const sorted = [...ids].sort();
    sorted.forEach((id, index) => steps.set(id, index - (sorted.length - 1) / 2));
  }
  return steps;
}

// The same fan-out as positions, for a map whose markers cannot be offset in
// pixels: each marker on a shared spot is moved sideways by `metersPerStep`
// (east-west), so they stand side by side. Ids are kept; a marker on its own
// is returned unchanged.
export function fanOutOperatorPositions(operators = [], metersPerStep = 0) {
  const list = Array.isArray(operators) ? operators : [];
  if (!(metersPerStep > 0)) return list;
  const fan = fanSteps(list);
  return list.map((operator) => {
    const steps = fan.get(String(operator?.id)) || 0;
    if (!steps) return operator;
    const lat = Number(operator.lat);
    const metersPerDegreeLng = 111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180));
    return { ...operator, lng: Number(operator.lng) + (steps * metersPerStep) / metersPerDegreeLng };
  });
}

// Metres one screen pixel covers on a MapLibre map (512 px tiles) at `zoom`.
export function metersPerPixel(zoom, lat) {
  const z = Number(zoom);
  if (!Number.isFinite(z)) return 0;
  return (40_075_016.686 * Math.max(0.01, Math.cos((Number(lat) * Math.PI) / 180))) / (512 * 2 ** z);
}
