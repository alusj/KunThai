import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterStrictSameCountry,
  isCrossBorderOperator,
  isEligibleForCrossBorderRoute,
  filterCrossBorderRoute,
  operatorCountryIso,
} from "./countryVisibility.js";

// Kambia, Sierra Leone: a Guinean operator is physically the closest, but the
// user is inside Sierra Leone.
const guineaOperatorNearBorder = {
  id: "gn-1",
  fleetName: "Conakry Express",
  countryCode: "GN",
  distanceKm: 2, // closer than every SL operator
};
const sierraLeoneOperator = {
  id: "sl-1",
  fleetName: "Freetown Rides",
  countryCode: "SL",
  distanceKm: 40,
};

test("Kambia user: a closer Guinean operator is EXCLUDED, not merely down-ranked", () => {
  const { items, excluded } = filterStrictSameCountry(
    [guineaOperatorNearBorder, sierraLeoneOperator],
    "SL",
  );
  assert.deepEqual(items.map((o) => o.id), ["sl-1"]);
  assert.equal(items.some((o) => o.countryCode === "GN"), false);
  assert.deepEqual(excluded.foreignCountry.map((o) => o.id), ["gn-1"]);
});

test("Sierra Leone user with NO Sierra Leone operators: result is empty, never Guinean", () => {
  const { items, excluded } = filterStrictSameCountry([guineaOperatorNearBorder], "SL");
  assert.deepEqual(items, []);
  assert.deepEqual(excluded.foreignCountry.map((o) => o.id), ["gn-1"]);
});

test("US user near Canada: Canadian operators do not appear in normal results", () => {
  const canadian = { id: "ca-1", country_iso: "CA", distanceKm: 1 };
  const american = { id: "us-1", country_iso: "US", distanceKm: 20 };
  const { items } = filterStrictSameCountry([canadian, american], "US");
  assert.deepEqual(items.map((o) => o.id), ["us-1"]);
});

test("Canada user near US: United States operators do not appear in normal results", () => {
  const canadian = { id: "ca-1", country: "Canada", distanceKm: 25 };
  const american = { id: "us-1", country: "United States", distanceKm: 1 };
  const { items } = filterStrictSameCountry([canadian, american], "CA");
  assert.deepEqual(items.map((o) => o.id), ["ca-1"]);
});

test("operator with a missing country_code is EXCLUDED until validated", () => {
  const missing = { id: "x-1", fleetName: "Unknown Fleet" };
  const blank = { id: "x-2", countryCode: "" };
  const valid = { id: "ok", countryCode: "SL" };
  const { items, excluded } = filterStrictSameCountry([missing, blank, valid], "SL");
  assert.deepEqual(items.map((o) => o.id), ["ok"]);
  assert.deepEqual(excluded.missingCountry.map((o) => o.id), ["x-1", "x-2"]);
});

test("free-text country names are normalized to ISO before comparison", () => {
  assert.equal(operatorCountryIso({ country: "USA" }), "US");
  assert.equal(operatorCountryIso({ country: "United States of America" }), "US");
  assert.equal(operatorCountryIso({ country: "Sierra Leone" }), "SL");
  const { items } = filterStrictSameCountry([{ id: "a", country: "USA" }], "US");
  assert.deepEqual(items.map((o) => o.id), ["a"]);
});

test("empty/invalid current country yields NOTHING (never an unscoped list)", () => {
  const { items } = filterStrictSameCountry(
    [{ id: "a", countryCode: "SL" }, { id: "b", countryCode: "GN" }],
    "",
  );
  assert.deepEqual(items, []);
});

test("a verified cross-border operator is still EXCLUDED from ordinary local results", () => {
  const crossBorder = {
    id: "cb-1",
    countryCode: "GN",
    crossBorderEnabled: true,
    approvedOriginCountries: ["GN", "SL"],
    approvedDestinationCountries: ["SL", "GN"],
    operatingLicenseStatus: "approved",
  };
  // In Sierra Leone's normal results, a Guinea-based operator never appears.
  const { items } = filterStrictSameCountry([crossBorder, sierraLeoneOperator], "SL");
  assert.deepEqual(items.map((o) => o.id), ["sl-1"]);
});

test("cross-border operator IS offered for an explicit supported SL->GN route", () => {
  const crossBorder = {
    id: "cb-1",
    countryCode: "SL",
    crossBorderEnabled: true,
    approvedOriginCountries: ["SL"],
    approvedDestinationCountries: ["GN"],
    operatingLicenseStatus: "approved",
  };
  assert.equal(isCrossBorderOperator(crossBorder), true);
  assert.equal(
    isEligibleForCrossBorderRoute(crossBorder, { originIso: "SL", destinationIso: "GN" }),
    true,
  );
});

test("cross-border eligibility fails when preconditions are not met", () => {
  const base = {
    id: "cb-1",
    countryCode: "SL",
    crossBorderEnabled: true,
    approvedOriginCountries: ["SL"],
    approvedDestinationCountries: ["GN"],
    operatingLicenseStatus: "approved",
  };
  // Not flagged cross-border -> proximity alone never qualifies it.
  assert.equal(
    isEligibleForCrossBorderRoute({ ...base, crossBorderEnabled: false }, { originIso: "SL", destinationIso: "GN" }),
    false,
  );
  // Route not on the approved destination list.
  assert.equal(
    isEligibleForCrossBorderRoute(base, { originIso: "SL", destinationIso: "LR" }),
    false,
  );
  // License not in good standing.
  assert.equal(
    isEligibleForCrossBorderRoute({ ...base, operatingLicenseStatus: "suspended" }, { originIso: "SL", destinationIso: "GN" }),
    false,
  );
  // Same-country "route" is not cross-border.
  assert.equal(
    isEligibleForCrossBorderRoute(base, { originIso: "SL", destinationIso: "SL" }),
    false,
  );
});

test("filterCrossBorderRoute keeps only eligible operators for the route", () => {
  const eligible = {
    id: "ok",
    countryCode: "SL",
    crossBorderEnabled: true,
    approved_origin_countries: ["SL"],
    approved_destination_countries: ["GN"],
    operating_license_status: "valid",
  };
  const ineligible = { id: "no", countryCode: "SL", crossBorderEnabled: false };
  const result = filterCrossBorderRoute([eligible, ineligible], { originIso: "SL", destinationIso: "GN" });
  assert.deepEqual(result.map((o) => o.id), ["ok"]);
});
