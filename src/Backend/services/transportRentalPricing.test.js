import test from "node:test";
import assert from "node:assert/strict";
import { initialRentalPickup, rentalDistanceKm, rentalQuote } from "../../components/services/transportRentalPricing.js";

test("rental price charges whole selected units and preserves separate deposit", () => {
  assert.deepEqual(rentalQuote({ daily_rate: 100, deposit: 50 }, "2026-09-10T10:00:00Z", "2026-09-11T10:01:00Z", "day"), { units: 2, total: 200, deposit: 50 });
  assert.deepEqual(rentalQuote({ weekly_rate: 600 }, "2026-09-10T10:00:00Z", "2026-09-17T10:00:00Z", "week"), { units: 1, total: 600, deposit: 0 });
});
test("invalid dates and unavailable rates cannot produce a booking quote", () => {
  assert.equal(rentalQuote({ daily_rate: 100 }, "", "", "day"), null);
  assert.equal(rentalQuote({ daily_rate: 100 }, "2026-09-10", "2026-09-09", "day"), null);
  assert.equal(rentalQuote({ daily_rate: 100 }, "2026-09-10", "2026-09-11", "hour"), null);
});
test("rental proximity measures fixed pickup pin without requiring an operator", () => {
  assert.equal(rentalDistanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  assert.ok(Math.abs(rentalDistanceKm({ latitude: 1, longitude: 0 }, { latitude: 0, longitude: 0 }) - 111.195) < 0.01);
  assert.equal(rentalDistanceKm({ latitude: 8, longitude: -13 }, null), null);
});
test("a company pin is reused only for the same rental pickup address", () => {
  const company = { address: "12 Main Street", coordinates: { latitude: 8.48, longitude: -13.2 } };
  assert.deepEqual(initialRentalPickup(company, { homeBase: " 12  MAIN Street " }), { pickup_address: "12  MAIN Street", latitude: 8.48, longitude: -13.2 });
  assert.deepEqual(initialRentalPickup(company, { homeBase: "25 Other Road" }), { pickup_address: "25 Other Road", latitude: null, longitude: null });
  assert.deepEqual(initialRentalPickup({ ...company, address: "" }, {}), { pickup_address: "", latitude: null, longitude: null });
});
