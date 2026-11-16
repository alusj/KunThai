import assert from "node:assert/strict";
import test from "node:test";

import {
  GLOBAL_COUNTRY_PROFILES,
  constrainCountryPhoneInput,
  normalizeCountryIso,
  normalizeCountryPhoneDigits,
  stripNationalTrunkZero,
  validateCountryPhone,
} from "./globalCountryProfiles.js";
import { DETECTED_COUNTRY_MAX_AGE_MS, pickTravelCountry } from "./countryChoice.js";
import { EMERGENCY_CONTACTS, getEmergencyContacts } from "./emergencyContacts.js";

test("a local leading zero is dropped in countries without a curated number plan", () => {
  assert.equal(normalizeCountryPhoneDigits("0912 345 678", "VN"), "912345678");
  assert.equal(normalizeCountryPhoneDigits("010 1234 5678", "EG"), "1012345678");
  assert.equal(normalizeCountryPhoneDigits("0917 123 4567", "PH"), "9171234567");
  // A country on the general rule.
  assert.equal(normalizeCountryPhoneDigits("0712 345 678", "TZ"), "712345678");
  assert.equal(normalizeCountryPhoneDigits("+84 912 345 678", "VN"), "912345678");
  assert.equal(stripNationalTrunkZero("0912345678", { iso2: "VN" }), "912345678");
});

test("countries whose numbers really start with zero keep it", () => {
  assert.equal(normalizeCountryPhoneDigits("06 1234 5678", "IT"), "0612345678");
  assert.equal(normalizeCountryPhoneDigits("06 612 3456", "CG"), "066123456");
  assert.equal(normalizeCountryPhoneDigits("0197000000", "BJ"), "0197000000");
});

test("curated countries keep their exact-length rule", () => {
  assert.equal(normalizeCountryPhoneDigits("076 123 456", "SL"), "76123456");
  assert.equal(normalizeCountryPhoneDigits("76 123 456", "SL"), "76123456");
  assert.equal(normalizeCountryPhoneDigits("0812 345 678", "TH"), "812345678");
});

test("the country in an address is the one written last, not a name inside another", () => {
  assert.equal(normalizeCountryIso("Bissau, Guinea-Bissau"), "GW");
  assert.equal(normalizeCountryIso("Port Moresby, Papua New Guinea"), "PG");
  assert.equal(normalizeCountryIso("Malabo, Equatorial Guinea"), "GQ");
  assert.equal(normalizeCountryIso("Atlanta, Georgia, United States"), "US");
  assert.equal(normalizeCountryIso("Newark, New Jersey, United States"), "US");
  assert.equal(normalizeCountryIso("Santa Fe, New Mexico, United States"), "US");
  assert.equal(normalizeCountryIso("Conakry, Guinea"), "GN");
  assert.equal(normalizeCountryIso("Lagos, Nigeria"), "NG");
  assert.equal(normalizeCountryIso("Niamey, Niger"), "NE");
  assert.equal(normalizeCountryIso("TH"), "TH");
});

test("the app follows GPS abroad only while the phone's time zone agrees", () => {
  const now = 1_800_000_000_000;
  const detected = { iso2: "GH", at: now - 3600e3 };
  assert.equal(pickTravelCountry({ accountIso: "SL", detected, timeZoneIso: "GH", now }), "GH");
  // Back home: the time zone is the account's country again.
  assert.equal(pickTravelCountry({ accountIso: "SL", detected, timeZoneIso: "SL", now }), "");
  // The time zone alone never moves the app.
  assert.equal(pickTravelCountry({ accountIso: "SL", detected: null, timeZoneIso: "GH", now }), "");
  // A stale reading is ignored.
  assert.equal(pickTravelCountry({ accountIso: "SL", detected: { iso2: "GH", at: now - DETECTED_COUNTRY_MAX_AGE_MS - 1 }, timeZoneIso: "GH", now }), "");
  assert.equal(pickTravelCountry({ accountIso: "GH", detected, timeZoneIso: "GH", now }), "");
});

test("every emergency number is dialable digits and belongs to a known country", () => {
  const known = new Set(GLOBAL_COUNTRY_PROFILES.map((profile) => profile.iso2));
  for (const [iso2, record] of Object.entries(EMERGENCY_CONTACTS)) {
    assert.ok(known.has(iso2), iso2);
    for (const number of [...record.police, ...record.ambulance, ...record.fire, ...record.national]) {
      assert.match(number, /^\d{2,6}$/, `${iso2} ${number}`);
    }
  }
  assert.deepEqual(getEmergencyContacts("VN").police, ["113"]);
  assert.deepEqual(getEmergencyContacts("EG").ambulance, ["123"]);
});

test("large countries have exact number rules", () => {
  const cases = [
    ["CN", "138 0013 8000", "+86 138 0013 8000"],
    ["RU", "8 912 345 67 89", "+7 912 345 67 89"],
    ["RU", "812 345 67 89", "+7 812 345 67 89"],
    ["IT", "06 1234 5678", "+39 061 234 5678"],
    ["ES", "612 345 678", "+34 612 345 678"],
    ["MX", "55 1234 5678", "+52 55 1234 5678"],
    ["ID", "0812 3456 7890", "+62 812 3456 7890"],
    ["TR", "0532 123 45 67", "+90 532 123 45 67"],
    ["SA", "050 123 4567", "+966 50 123 4567"],
    ["KR", "010 1234 5678", "+82 10 1234 5678"],
    ["NL", "06 12345678", "+31 61 234 5678"],
    ["CH", "079 123 45 67", "+41 79 123 45 67"],
    ["PK", "0301 2345678", "+92 301 2345678"],
    ["BD", "01712 345678", "+880 1712 345678"],
    ["EG", "010 1234 5678", "+20 10 1234 5678"],
    ["PH", "0917 123 4567", "+63 917 123 4567"],
    ["VN", "0912 345 678", "+84 91 234 5678"],
    ["MY", "012 345 6789", "+60 12 345 6789"],
    ["SG", "9123 4567", "+65 9123 4567"],
    ["AR", "011 1234 5678", "+54 11 1234 5678"],
    ["PL", "512 345 678", "+48 512 345 678"],
  ];
  for (const [iso2, typed, expected] of cases) {
    assert.equal(constrainCountryPhoneInput(typed, iso2, { international: true }), expected, iso2);
    assert.equal(validateCountryPhone(expected, iso2).valid, true, iso2);
  }
  // Too short or too long is refused, where the general rule let it through.
  assert.equal(validateCountryPhone("+65 9123", "SG").valid, false);
  assert.equal(validateCountryPhone("+34 612 345", "ES").valid, false);
  assert.equal(constrainCountryPhoneInput("9123 4567 89", "SG", { international: true }), "+65 9123 4567");
});
