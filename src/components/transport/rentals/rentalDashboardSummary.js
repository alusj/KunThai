export function rentalDashboardSummary(rentals, reservations) {
  const current = rentals.filter((rental) => !rental.deleted_at);
  const ids = new Set(rentals.map((rental) => rental.id));
  const rows = reservations.filter((row) => ids.has(row.rental_id));
  return {
    total: current.length,
    available: current.filter((rental) => rental.status === "available").length,
    requested: rows.filter((row) => row.status === "requested"),
    active: rows.filter((row) => row.status === "active"),
    confirmed: rows.filter((row) => row.status === "confirmed").sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
    completed: rows.filter((row) => row.status === "completed").length,
  };
}
