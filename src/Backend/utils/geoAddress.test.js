import assert from "node:assert/strict";
import { test } from "node:test";

import { dedupeAddressParts, cleanAddressString, normalizeGeocodeAddress } from "./geoAddress.js";

test("removes repeated commas, spaces and duplicate parts", () => {
  assert.equal(
    cleanAddressString("26a Grassfield,, Lumley, Lumley, Sierra Leone, Sierra Leone"),
    "26a Grassfield, Lumley, Sierra Leone",
  );
});

test("collapses duplicate city/country (case-insensitive)", () => {
  assert.equal(cleanAddressString("Lumley, Sierra Leone, Sierra Leone"), "Lumley, Sierra Leone");
  assert.equal(cleanAddressString("Lumley, SIERRA LEONE, sierra leone"), "Lumley, SIERRA LEONE");
});

test("trims stray trailing punctuation from parts", () => {
  assert.equal(cleanAddressString("Grassfield Lumley., Freetown."), "Grassfield Lumley, Freetown");
  assert.equal(cleanAddressString("Freetown.,, Sierra Leone."), "Freetown, Sierra Leone");
});

test("dedupeAddressParts drops empty parts", () => {
  assert.equal(dedupeAddressParts(["Grassfield", "", "Lumley", "", "Sierra Leone"]), "Grassfield, Lumley, Sierra Leone");
});

test("normalizeGeocodeAddress prioritises community/neighbourhood first", () => {
  const raw = {
    house_number: "26a",
    road: "Grassfield Road",
    neighbourhood: "Grassfield",
    suburb: "Lumley",
    city: "Freetown",
    state: "Western Area",
    country: "Sierra Leone",
  };
  const out = normalizeGeocodeAddress(raw, { latitude: 8.484, longitude: -13.268 });
  assert.equal(out.community, "Grassfield");
  assert.equal(out.street, "26a Grassfield Road");
  assert.equal(out.city, "Freetown");
  assert.equal(out.country, "Sierra Leone");
  // Community first, then street, then city, region, country — no duplicates.
  assert.equal(out.formattedAddress, "Grassfield, 26a Grassfield Road, Freetown, Western Area, Sierra Leone");
  assert.equal(out.latitude, 8.484);
  assert.equal(out.longitude, -13.268);
});

test("falls back to town/village when city missing, and never duplicates the same area", () => {
  const raw = { village: "Lumley", country: "Sierra Leone" };
  const out = normalizeGeocodeAddress(raw);
  // "Lumley" appears as community AND city candidates but must show once.
  assert.equal(out.formattedAddress, "Lumley, Sierra Leone");
});
