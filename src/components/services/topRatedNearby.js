// Pure helpers for "Top Rated near you" (UrRide). The ranking itself runs in
// the database (transport_top_rated_nearby); these put the hydrated fleets in
// that order and describe distance and travel time honestly.

// Typical city speeds (km/h) used only for a rough "about N min" estimate.
const CITY_SPEED_KMH = { motorcycle: 25, tricycle: 18, car: 22, van: 20, bus: 18, truck: 18 };
const DEFAULT_CITY_SPEED_KMH = 20;
// Time to set off and reach the pickup point once a booking is accepted.
const PICKUP_BUFFER_MIN = 2;

export function estimateTravelMinutes(distanceKm, fleetType = "") {
  if (distanceKm === null || distanceKm === undefined || distanceKm === "") return null;
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance < 0) return null;
  const speed = CITY_SPEED_KMH[String(fleetType || "").toLowerCase()] || DEFAULT_CITY_SPEED_KMH;
  return Math.max(1, Math.ceil((distance / speed) * 60 + PICKUP_BUFFER_MIN));
}

// Where the operator's phone last shared its position and how sure it is,
// when the database row carries them (transport_fleet_distances), plus the
// passenger's own accuracy: the same fields "Available near you" reads, so
// every list words one operator's distance and place the same way.
function positionDetails(row, passengerAccuracy) {
  const metres = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  return {
    lastSeenPlace: String(row?.last_seen_place || "").trim(),
    operatorAccuracyM: metres(row?.accuracy_m),
    passengerAccuracyM: metres(passengerAccuracy),
  };
}

function rowDistanceKm(row) {
  const metres = row?.distance_m === null || row?.distance_m === undefined || row?.distance_m === "" ? NaN : Number(row.distance_m);
  if (Number.isFinite(metres) && metres >= 0) return metres / 1000;
  return row?.distance_km === null || row?.distance_km === undefined ? NaN : Number(row.distance_km);
}

// Orders hydrated fleets by the database ranking and attaches distance data.
// Fleets the client filters removed (country, mode, visibility) stay removed;
// ranking rows without a hydrated fleet are skipped.
export function applyNearbyRanking(fleets = [], rankingRows = [], { passengerAccuracy = null } = {}) {
  const byId = new Map((fleets || []).map((fleet) => [fleet.id, fleet]));
  const rated = [];
  const fresh = [];
  let radiusKm = null;

  for (const row of rankingRows || []) {
    const fleet = byId.get(row?.fleet_id);
    if (!fleet) continue;
    radiusKm = Number(row.radius_km) || radiusKm;

    const distanceKm = row.distance_km === null || row.distance_km === undefined ? NaN : Number(row.distance_km);
    const known = Number.isFinite(distanceKm);
    const live = known && row.location_source === "live";
    const item = {
      ...fleet,
      ...positionDetails(row, passengerAccuracy),
      distanceKm: known ? distanceKm : null,
      // An online operator with no recent position (they left KunThai) is
      // listed without any distance line.
      distanceSource: known ? (live ? "live" : "recent") : null,
      // A travel time only makes sense from a live position.
      etaMinutes: live ? estimateTravelMinutes(distanceKm, fleet.fleetType) : null,
    };
    if (row.is_rated) rated.push(item);
    else fresh.push(item);
  }

  return { rated, fresh, radiusKm };
}

// Category lists (Book a Ride / Send Delivery): attach measured distances and
// put ACTIVE fleets nearest first. Fleets without a usable position keep
// their place after the measured ones; offline fleets stay last, as before.
export function applyFleetDistances(fleets = [], distanceRows = [], { passengerAccuracy = null } = {}) {
  const byId = new Map((distanceRows || []).map((row) => [row?.fleet_id, row]));
  const withDistance = (fleets || []).map((fleet, index) => {
    const row = byId.get(fleet.id);
    const distanceKm = row ? rowDistanceKm(row) : NaN;
    if (!Number.isFinite(distanceKm)) return { fleet: { ...fleet, distanceSource: null }, index, distanceKm: null };
    const live = row.location_source === "live";
    return {
      fleet: {
        ...fleet,
        ...positionDetails(row, passengerAccuracy),
        distanceKm,
        distanceSource: live ? "live" : "recent",
        etaMinutes: live ? estimateTravelMinutes(distanceKm, fleet.fleetType) : null,
      },
      index,
      distanceKm,
    };
  });

  return withDistance
    .sort((a, b) => {
      const aActive = a.fleet.activeStatus === "active";
      const bActive = b.fleet.activeStatus === "active";
      if (aActive !== bActive) return aActive ? -1 : 1;
      if (aActive && a.distanceKm !== b.distanceKm) {
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.fleet);
}
