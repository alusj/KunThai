import test from "node:test";
import assert from "node:assert/strict";
import { isExpiredRentalRequest, rentalDashboardSummary, rentalDisplayStatus } from "./rentalDashboardSummary.js";

test("a request whose pickup time has passed is not counted as waiting", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  assert.equal(isExpiredRentalRequest({ status: "requested", starts_at: "2026-10-08T11:00:00Z" }, now), true);
  assert.equal(isExpiredRentalRequest({ status: "requested", starts_at: "2026-10-08T13:00:00Z" }, now), false);
  assert.equal(isExpiredRentalRequest({ status: "confirmed", starts_at: "2026-10-08T11:00:00Z" }, now), false);
  const result = rentalDashboardSummary([{ id: "a", status: "available" }], [
    { id: "stale", rental_id: "a", status: "requested", starts_at: "2000-01-01T00:00:00Z" },
    { id: "fresh", rental_id: "a", status: "requested", starts_at: "2999-01-01T00:00:00Z" },
  ]);
  assert.deepEqual(result.requested.map((row) => row.id), ["fresh"]);
});

test("a vehicle on a confirmed or collected booking shows as reserved or rented out", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  const rental = { id: "a", status: "available" };
  const booking = { rental_id: "a", starts_at: "2026-10-08T10:00:00Z", ends_at: "2026-10-09T10:00:00Z" };
  assert.equal(rentalDisplayStatus(rental, [], now), "available");
  assert.equal(rentalDisplayStatus(rental, [{ ...booking, status: "confirmed" }], now), "reserved");
  assert.equal(rentalDisplayStatus(rental, [{ ...booking, status: "active" }], now), "rented_out");
  assert.equal(rentalDisplayStatus(rental, [{ ...booking, status: "completed" }], now), "available");
  assert.equal(rentalDisplayStatus({ ...rental, display_status: "rented_out" }, [], now), "rented_out");
});

test("company rental statistics separate public availability from active reservations", () => {
  const rentals = [{ id: "a", status: "available" }, { id: "b", status: "hidden" }, { id: "deleted", deleted_at: "today", status: "hidden" }];
  const rows = [{ rental_id: "a", status: "requested" }, { rental_id: "b", status: "active" }, { rental_id: "deleted", status: "completed" }, { rental_id: "other-company", status: "requested" }];
  const result = rentalDashboardSummary(rentals, rows);
  assert.equal(result.total, 2);
  assert.equal(result.available, 1);
  assert.equal(result.requested.length, 1);
  assert.equal(result.active.length, 1);
  assert.equal(result.completed, 1);
});

test("a vehicle dashboard scopes activity and orders pickups by collection time", () => {
  const result = rentalDashboardSummary([{ id: "a", status: "available" }], [
    { id: "later", rental_id: "a", status: "confirmed", starts_at: "2026-10-12" },
    { id: "other", rental_id: "b", status: "confirmed", starts_at: "2026-10-01" },
    { id: "next", rental_id: "a", status: "confirmed", starts_at: "2026-10-10" },
    { id: "cancelled", rental_id: "a", status: "cancelled" },
  ]);
  assert.deepEqual(result.confirmed.map((row) => row.id), ["next", "later"]);
  assert.equal(result.completed, 0);
});
