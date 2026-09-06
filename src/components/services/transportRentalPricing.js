export const RENTAL_STATUSES = ["available", "reserved", "rented_out", "maintenance", "hidden"];
export const RENTAL_RATE_UNITS = { hour: { seconds: 3600, key: "hourly_rate" }, day: { seconds: 86400, key: "daily_rate" }, week: { seconds: 604800, key: "weekly_rate" } };
export function fixedRentalTimeRates(rental = {}) {
  if (rental.time_negotiable) return [];
  return Object.entries(RENTAL_RATE_UNITS).filter(([, definition]) => Number(rental[definition.key]) > 0);
}
export function hasBookableRentalTimeRate(rental = {}) {
  return fixedRentalTimeRates(rental).length > 0;
}
export function initialRentalPickup(company, fleet) {
  const address = String(fleet.homeBase || company.address || "").trim();
  const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const sameAddress = Boolean(address) && normalize(address) === normalize(company.address);
  const latitude = company.coordinates?.latitude ?? company.coordinates?.lat;
  const longitude = company.coordinates?.longitude ?? company.coordinates?.lng;
  const validPoint = [latitude, longitude].every((value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)))
    && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180;
  return { pickup_address: address, latitude: sameAddress && validPoint ? Number(latitude) : null, longitude: sameAddress && validPoint ? Number(longitude) : null };
}
export function rentalQuote(rental, startsAt, endsAt, unit) {
  const definition = RENTAL_RATE_UNITS[unit];
  const duration = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 1000;
  const rate = Number(rental?.[definition?.key]);
  if (rental?.time_negotiable || !definition || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(rate) || rate <= 0) return null;
  const units = Math.ceil(duration / definition.seconds);
  return { units, total: Math.round(units * rate * 100) / 100, deposit: Number(rental.deposit || 0) };
}
export function rentalDistanceKm(rental, coordinates) {
  if (rental.latitude == null || rental.longitude == null || coordinates?.latitude == null || coordinates?.longitude == null) return null;
  const radians = (value) => value * Math.PI / 180;
  const a = Math.sin(radians(rental.latitude - coordinates.latitude) / 2) ** 2 + Math.cos(radians(coordinates.latitude)) * Math.cos(radians(rental.latitude)) * Math.sin(radians(rental.longitude - coordinates.longitude) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
