import assert from "node:assert/strict";
import { test } from "node:test";

import { getEmergencyContacts, DEFAULT_EMERGENCY } from "../../../data/emergencyContacts.js";
import { resolveOperationalCountry } from "./resolveOperationalCountry.js";

// The emergency card is stricter than operator search: it shows ONLY the
// resolved current country's numbers and never substitutes a neighbour's.

test("Sierra Leone user sees only Sierra Leone emergency numbers", () => {
  const contacts = getEmergencyContacts("SL");
  assert.equal(contacts.country, "Sierra Leone");
  assert.equal(contacts.countryCode, "SL");
  assert.equal(contacts.ambulance.includes("117"), true);
});

test("United States user sees only United States emergency numbers", () => {
  const contacts = getEmergencyContacts("US");
  assert.equal(contacts.countryCode, "US");
  assert.deepEqual(contacts.police, ["911"]);
});

test("Guinea and Sierra Leone never share the same emergency record", () => {
  const sl = getEmergencyContacts("SL");
  const gn = getEmergencyContacts("GN");
  assert.notEqual(sl.countryCode, gn.countryCode);
  // No accidental cross-pollination of numbers between the neighbours.
  assert.notDeepEqual(sl.police, gn.police);
});

test("missing emergency data does NOT substitute a neighbouring country's numbers", () => {
  // An ISO with no record falls back to the safe DEFAULT, which carries no
  // fabricated numbers — never a nearby country's.
  const contacts = getEmergencyContacts("ZZ");
  assert.equal(contacts, DEFAULT_EMERGENCY);
  assert.deepEqual(contacts.police, []);
  assert.deepEqual(contacts.ambulance, []);
  assert.equal(contacts.countryCode, "");
});

test("empty country resolves to the safe default (no numbers invented)", () => {
  const contacts = getEmergencyContacts("");
  assert.equal(contacts, DEFAULT_EMERGENCY);
  assert.deepEqual(contacts.fire, []);
});

test("the emergency country tracks the RESOLVED operational country, gps-first", () => {
  // Border-confirmed to Guinea -> emergency card must be Guinea, even though the
  // centre reading suggested Sierra Leone.
  const resolved = resolveOperationalCountry({
    liveReading: {
      countryCode: "SL",
      alternativeCountryCode: "GN",
      isBorderUncertain: true,
      sampledCountries: ["SL", "GN"],
      confirmedCountryCode: "GN",
    },
  });
  const contacts = getEmergencyContacts(resolved.countryCode);
  assert.equal(contacts.countryCode, "GN");
});
