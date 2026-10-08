// A request whose pickup time has passed can no longer be confirmed. The
// server declines it on its next change; until then it counts as history.
export function isExpiredRentalRequest(row, now = Date.now()) {
  if (row?.status !== "requested" || !row.starts_at) return false;
  const startsAt = new Date(row.starts_at).getTime();
  return Number.isFinite(startsAt) && startsAt < now;
}

// The status a renter or company sees. Stored availability says whether new
// requests are accepted; a confirmed or collected booking covering now means
// the vehicle is reserved or out on rent.
export function rentalDisplayStatus(rental, reservations = null, now = Date.now()) {
  if (!rental) return "";
  if (rental.display_status) return rental.display_status;
  const current = (reservations || []).filter((row) =>
    row.rental_id === rental.id &&
    ["confirmed", "active"].includes(row.status) &&
    new Date(row.starts_at).getTime() <= now &&
    new Date(row.ends_at).getTime() > now,
  );
  if (current.some((row) => row.status === "active")) return "rented_out";
  if (current.length) return "reserved";
  return rental.status || "";
}

const RENTAL_STATUS_KEYS = {
  available: "urride.companyFix.rentalStatusAvailable",
  reserved: "urride.companyFix.rentalStatusReserved",
  rented_out: "urride.companyFix.rentalStatusRentedOut",
  maintenance: "urride.companyFix.rentalStatusMaintenance",
  hidden: "urride.companyFix.rentalStatusHidden",
};

// Translation key for a displayed rental status (falls back to "not available").
export function rentalStatusKey(status) {
  return RENTAL_STATUS_KEYS[status] || RENTAL_STATUS_KEYS.hidden;
}

export function rentalDashboardSummary(rentals, reservations) {
  const current = rentals.filter((rental) => !rental.deleted_at);
  const ids = new Set(rentals.map((rental) => rental.id));
  const rows = reservations.filter((row) => ids.has(row.rental_id));
  return {
    total: current.length,
    available: current.filter((rental) => rental.status === "available").length,
    requested: rows.filter((row) => row.status === "requested" && !isExpiredRentalRequest(row)),
    active: rows.filter((row) => row.status === "active"),
    confirmed: rows.filter((row) => row.status === "confirmed").sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
    completed: rows.filter((row) => row.status === "completed").length,
  };
}
