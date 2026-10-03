import assert from "node:assert/strict";
import test from "node:test";

import { bookingTimeZone, lateHourPhase, lateHourStatus, localTimeParts } from "./lateHourBooking.js";

const at = (hh, mm) => hh * 60 + mm;

test("the windows: 19:30 evening, 20:00 night, 05:30 morning, 06:30 nothing", () => {
  assert.equal(lateHourPhase(at(19, 29)), null);
  assert.equal(lateHourPhase(at(19, 30)), "evening");
  assert.equal(lateHourPhase(at(19, 59)), "evening");
  assert.equal(lateHourPhase(at(20, 0)), "night");
  assert.equal(lateHourPhase(at(23, 59)), "night");
  assert.equal(lateHourPhase(at(0, 0)), "night");
  assert.equal(lateHourPhase(at(5, 29)), "night");
  assert.equal(lateHourPhase(at(5, 30)), "morning");
  assert.equal(lateHourPhase(at(6, 29)), "morning");
  assert.equal(lateHourPhase(at(6, 30)), null);
  assert.equal(lateHourPhase(at(12, 0)), null);
});

test("local time is read in the booking country's zone, not the phone's", () => {
  const instant = new Date("2026-10-03T19:45:00Z"); // 19:45 in Freetown (UTC+0)
  assert.deepEqual(localTimeParts(instant, "Africa/Freetown"), { hour: 19, minute: 45, minutesOfDay: at(19, 45) });
  assert.equal(lateHourStatus({ date: instant, countryIso: "SL", deviceTimeZone: "Europe/Paris" }).phase, "evening");
  // Same instant is 20:45 in Lagos (UTC+1): night there.
  assert.equal(lateHourStatus({ date: instant, countryIso: "NG", deviceTimeZone: "Europe/Paris" }).phase, "night");
  // ...and 22:45 in Nairobi (UTC+3).
  const nairobi = lateHourStatus({ date: instant, countryIso: "KE", deviceTimeZone: "Africa/Nairobi" });
  assert.equal(nairobi.localTime, "22:45");
  assert.equal(nairobi.phase, "night");
});

test("a phone already in the booking country keeps its exact zone", () => {
  assert.equal(bookingTimeZone({ countryIso: "US", deviceTimeZone: "America/Denver" }), "America/Denver");
  assert.equal(bookingTimeZone({ countryIso: "GH", deviceTimeZone: "Africa/Accra" }), "Africa/Accra");
});

test("multi-zone countries pick the zone matching the pickup's longitude", () => {
  const date = new Date("2026-01-15T12:00:00Z");
  // Los Angeles longitude, phone abroad.
  assert.equal(bookingTimeZone({ countryIso: "US", longitude: -118.24, deviceTimeZone: "Africa/Freetown", date }).startsWith("America/"), true);
  const westCoast = bookingTimeZone({ countryIso: "US", longitude: -118.24, deviceTimeZone: "Africa/Freetown", date });
  const eastCoast = bookingTimeZone({ countryIso: "US", longitude: -74.0, deviceTimeZone: "Africa/Freetown", date });
  assert.notEqual(westCoast, eastCoast);
  assert.equal(localTimeParts(date, westCoast).hour, 4); // UTC-8 in January
  assert.equal(localTimeParts(date, eastCoast).hour, 7); // UTC-5 in January
});

test("daylight saving is respected", () => {
  // London is UTC+1 in summer: 19:10 UTC is 20:10 local -> night.
  assert.equal(lateHourStatus({ date: new Date("2026-07-01T19:10:00Z"), countryIso: "GB", deviceTimeZone: "Europe/London" }).phase, "night");
  // ...and UTC+0 in winter: 19:40 UTC is 19:40 local -> evening.
  assert.equal(lateHourStatus({ date: new Date("2026-01-10T19:40:00Z"), countryIso: "GB", deviceTimeZone: "Europe/London" }).phase, "evening");
});

test("unknown country falls back to the phone's zone", () => {
  const status = lateHourStatus({ date: new Date("2026-10-03T05:45:00Z"), countryIso: "", deviceTimeZone: "Africa/Freetown" });
  assert.equal(status.timeZone, "Africa/Freetown");
  assert.equal(status.phase, "morning");
});
