import test from "node:test";
import assert from "node:assert/strict";
import { rentalDashboardSummary } from "./rentalDashboardSummary.js";

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
