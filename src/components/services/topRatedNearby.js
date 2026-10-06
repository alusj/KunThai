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

// Orders hydrated fleets by the database ranking and attaches distance data.
// Fleets the client filters removed (country, mode, visibility) stay removed;
// ranking rows without a hydrated fleet are skipped.
export function applyNearbyRanking(fleets = [], rankingRows = []) {
  const byId = new Map((fleets || []).map((fleet) => [fleet.id, fleet]));
  const rated = [];
  const fresh = [];
  let radiusKm = null;

  for (const row of rankingRows || []) {
    const fleet = byId.get(row?.fleet_id);
    if (!fleet) continue;
    radiusKm = Number(row.radius_km) || radiusKm;

    const distanceKm = row.distance_km === null || row.distance_km === undefined ? NaN : Number(row.distance_km);
    const live = row.location_source === "live";
    const item = {
      ...fleet,
      distanceKm: Number.isFinite(distanceKm) ? distanceKm : null,
      distanceSource: live ? "live" : "recent",
      // A travel time only makes sense from a live position.
      etaMinutes: live ? estimateTravelMinutes(distanceKm, fleet.fleetType) : null,
    };
    if (row.is_rated) rated.push(item);
    else fresh.push(item);
  }

  return { rated, fresh, radiusKm };
}
