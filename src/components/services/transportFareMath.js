// Pure fare arithmetic (no app imports), shared by the pricing service and the
// open-booking fare offers, and testable under plain Node.
export function calculateFleetFare(fleet, { bookingMethod = "distance", distanceKm = 0, bookedHours = 0 } = {}) {
  if (!fleet) return null;

  const baseFare = Math.max(0, Number(fleet.baseFare || 0));
  const rate = bookingMethod === "time"
    ? Math.max(0, Number(fleet.pricePerHour || 0))
    : Math.max(0, Number(fleet.pricePerKm || 0));
  const units = bookingMethod === "time" ? Math.max(0, Number(bookedHours || 0)) : Math.max(0, Number(distanceKm || 0));

  if (!rate || !units) {
    return {
      amount: baseFare || 0,
      baseFare,
      rate,
      units,
      ready: false,
    };
  }

  return {
    amount: Math.max(baseFare, rate * units),
    baseFare,
    rate,
    units,
    ready: true,
  };
}
