import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildFareOffers, collapseOpenBookingTrips, roundOfferAmount, toDbFleetType } from "./openBookingModels.js";

test("UI vehicle values map to database fleet types", () => {
  assert.equal(toDbFleetType("Motorcycle"), "motorcycle");
  assert.equal(toDbFleetType("Tricycle"), "tricycle");
  assert.equal(toDbFleetType("Car"), "car");
});

test("offers are round amounts", () => {
  assert.equal(roundOfferAmount(23.4), 23);
  assert.equal(roundOfferAmount(118), 120);
  assert.equal(roundOfferAmount(0), 0);
  assert.equal(roundOfferAmount("abc"), 0);
});

test("fare offers come from what operators charge for the route", () => {
  const fleets = [
    { baseFare: 10, pricePerKm: 5 },
    { baseFare: 10, pricePerKm: 7 },
    { baseFare: 0, pricePerKm: 0 }, // no prices published: ignored
  ];
  const offers = buildFareOffers(fleets, { distanceKm: 10 }); // 50 and 70
  assert.equal(offers.sampleSize, 2);
  assert.equal(offers.average, 60);
  assert.ok(offers.economy < offers.average && offers.priority > offers.average);
});

test("no published prices means no offers (the passenger names an amount)", () => {
  assert.equal(buildFareOffers([{ baseFare: 0, pricePerKm: 0 }], { distanceKm: 4 }), null);
  assert.equal(buildFareOffers([], { distanceKm: 4 }), null);
});

test("an open booking shows once in the passenger's lists", () => {
  const rows = [
    { id: "a", open_booking_id: "g1", status: "requested" },
    { id: "plain", status: "accepted" },
    { id: "b", open_booking_id: "g1", status: "accepted" },
    { id: "c", open_booking_id: "g2", status: "requested" },
    { id: "d", open_booking_id: "g2", status: "requested" },
  ];
  assert.deepEqual(collapseOpenBookingTrips(rows).map((row) => row.id), ["b", "plain", "c"]);
});

test("the migration keeps first-accept-wins and nearest-first selection", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20260927120000_urride_open_bookings.sql", import.meta.url), "utf8");
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /Another operator already took this open booking\./);
  assert.match(sql, /array\[3, 7, 15, 30\]/);
  assert.match(sql, /fleet\.fleet_type::text/); // enum columns are compared as text
  assert.match(sql, /security definer/);
});
