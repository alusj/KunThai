import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCountryFromReading, offsetCoordinate } from "./countryBoundary.js";
import { resolveOperationalCountry } from "./resolveOperationalCountry.js";

// A deterministic country lookup keyed on longitude: west of -13.0 is Guinea
// (GN), east of it is Sierra Leone (SL). This models the Kambia/Guinea border
// without any network calls.
function borderLookup(lat, lng) {
  return lng < -13.0 ? "GN" : "SL";
}

test("precise fix inside one country is HIGH confidence, no border flag", async () => {
  const reading = await resolveCountryFromReading(
    { latitude: 8.46, longitude: -12.5, accuracyMeters: 30 },
    borderLookup,
  );
  assert.equal(reading.countryCode, "SL");
  assert.equal(reading.isBorderUncertain, false);
  assert.equal(reading.confidence, "high");
});

test("weak fix whose accuracy ring straddles the border is UNCERTAIN with an alternative", async () => {
  // Centre just inside SL (-12.99) but a ~5km accuracy radius reaches across
  // -13.0 into GN.
  const reading = await resolveCountryFromReading(
    { latitude: 9.9, longitude: -12.99, accuracyMeters: 5000 },
    borderLookup,
  );
  assert.equal(reading.isBorderUncertain, true);
  assert.equal(reading.confidence, "low");
  assert.equal(reading.countryCode, "SL"); // centre stays the primary suggestion
  assert.equal(reading.alternativeCountryCode, "GN");
  assert.deepEqual([...reading.sampledCountries].sort(), ["GN", "SL"]);
});

test("weak fix well inside one country stays single-country (medium)", async () => {
  const reading = await resolveCountryFromReading(
    { latitude: 8.0, longitude: -11.0, accuracyMeters: 3000 },
    borderLookup,
  );
  assert.equal(reading.isBorderUncertain, false);
  assert.equal(reading.countryCode, "SL");
  assert.equal(reading.confidence, "medium");
});

test("offsetCoordinate moves roughly the requested distance", () => {
  const p = offsetCoordinate(8.0, -13.0, 1000, 90); // 1km east
  // ~0.009 deg lng at this latitude; sanity bounds only.
  assert.ok(p.longitude > -13.0 && p.longitude < -12.98);
  assert.ok(Math.abs(p.latitude - 8.0) < 0.01);
});

// --- priority order -------------------------------------------------------

test("live GPS wins over profile and IP", () => {
  const result = resolveOperationalCountry({
    liveReading: { countryCode: "SL", confidence: "high", isBorderUncertain: false, latitude: 8.4, longitude: -13.2 },
    profileCountry: "US",
    ipCountry: "GN",
  });
  assert.equal(result.countryCode, "SL");
  assert.equal(result.source, "gps");
  assert.equal(result.requiresConfirmation, false);
});

test("border-uncertain live reading requires confirmation and does NOT fall back to profile", () => {
  const result = resolveOperationalCountry({
    liveReading: {
      countryCode: "SL",
      alternativeCountryCode: "GN",
      isBorderUncertain: true,
      sampledCountries: ["SL", "GN"],
      latitude: 9.9,
      longitude: -12.99,
    },
    profileCountry: "GN",
  });
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.countryCode, "SL");
  assert.equal(result.alternativeCountryCode, "GN");
  assert.equal(result.source, "gps");
});

test("a border confirmation matching a candidate resolves cleanly, no mixing", () => {
  const result = resolveOperationalCountry({
    liveReading: {
      countryCode: "SL",
      alternativeCountryCode: "GN",
      isBorderUncertain: true,
      sampledCountries: ["SL", "GN"],
      confirmedCountryCode: "GN",
      latitude: 9.9,
      longitude: -12.99,
    },
  });
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.countryCode, "GN");
  assert.equal(result.source, "manual-confirmation");
});

test("profile country is used ONLY when live location is unavailable, tagged as fallback", () => {
  const result = resolveOperationalCountry({ profileCountry: "US" });
  assert.equal(result.countryCode, "US");
  assert.equal(result.source, "profile-fallback");
  assert.equal(result.confidence, "low");
});

test("IP country is the last resort", () => {
  const result = resolveOperationalCountry({ ipCountry: "CA" });
  assert.equal(result.countryCode, "CA");
  assert.equal(result.source, "ip-fallback");
});

test("planning country applies only in explicit planning mode and below live GPS", () => {
  const withoutPlanningMode = resolveOperationalCountry({
    planningCountry: { countryCode: "GN" },
    profileCountry: "SL",
  });
  // planningActive not set -> ignored, profile fallback used.
  assert.equal(withoutPlanningMode.countryCode, "SL");
  assert.equal(withoutPlanningMode.source, "profile-fallback");

  const inPlanningMode = resolveOperationalCountry({
    planningActive: true,
    planningCountry: { countryCode: "GN" },
    profileCountry: "SL",
  });
  assert.equal(inPlanningMode.countryCode, "GN");
  assert.equal(inPlanningMode.source, "planning");
});

test("no signals at all resolves to an unknown country (empty), not a default guess", () => {
  const result = resolveOperationalCountry({});
  assert.equal(result.countryCode, "");
  assert.equal(result.source, "none");
});
