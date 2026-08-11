export function normalizeBookingLocationPoint(place) {
  const rawLat = place?.coordinates?.latitude ?? place?.coordinates?.lat ?? place?.lat ?? place?.latitude;
  const rawLng = place?.coordinates?.longitude ?? place?.coordinates?.lng ?? place?.lng ?? place?.longitude;
  if (rawLat === null || rawLat === undefined || rawLat === "" || rawLng === null || rawLng === undefined || rawLng === "") return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    ...place,
    lat,
    lng,
    address: place.address || place.fullAddress || place.detectedAddress || place.street || place.placeName || place.name || "",
    name: place.name || place.placeName || place.label || place.address || "Selected location",
    searchQuery: place.searchQuery || place.fullAddress || place.address || place.street || place.placeName || place.name || "",
  };
}

export function getBookingLocationInputValue(place) {
  return String(place?.address || place?.fullAddress || place?.detectedAddress || place?.street || place?.placeName || place?.name || "").trim();
}

// Explicit locations carried by the booking action or a draft always win.
// Saved preferences fill only the side that has no explicit text or point.
export function resolveBookingLocationPreferences({
  target = {},
  draftForm = null,
  preferredPickupPlace = null,
  preferredDropoffPlace = null,
} = {}) {
  const targetPickup = target.pickup || target.movement?.pickup || draftForm?.pickup || "";
  const targetDropoff = target.destination || target.movement?.destination || draftForm?.dropoff || "";
  const targetPickupPoint = normalizeBookingLocationPoint(target.pickupPoint || target.movement?.pickupPoint || draftForm?.pickupPoint);
  const targetDropoffPoint = normalizeBookingLocationPoint(target.destinationPoint || target.movement?.destinationPoint || draftForm?.dropoffPoint);
  const preferredPickupPoint = normalizeBookingLocationPoint(preferredPickupPlace);
  const preferredDropoffPoint = normalizeBookingLocationPoint(preferredDropoffPlace);
  const usePreferredPickup = !targetPickup && !targetPickupPoint;
  const usePreferredDropoff = !targetDropoff && !targetDropoffPoint;

  return {
    pickup: targetPickup || getBookingLocationInputValue(targetPickupPoint) || (usePreferredPickup ? getBookingLocationInputValue(preferredPickupPlace) : ""),
    dropoff: targetDropoff || getBookingLocationInputValue(targetDropoffPoint) || (usePreferredDropoff ? getBookingLocationInputValue(preferredDropoffPlace) : ""),
    pickupPoint: targetPickupPoint || (usePreferredPickup ? preferredPickupPoint : null),
    dropoffPoint: targetDropoffPoint || (usePreferredDropoff ? preferredDropoffPoint : null),
  };
}
