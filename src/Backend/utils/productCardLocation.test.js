import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getProductCardLocation,
  buildCardSellerLocation,
  sameCity,
  normalizeCityKey,
  normalizeCountryKey,
} from "./productCardLocation.js";

// ---- The "must pass" example matrix from the spec -------------------------

test("same city -> community + city", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "Freetown", country: "Sierra Leone" },
      sellerLocation: { community: "Lumley", city: "Freetown", country: "Sierra Leone" },
    }),
    "Lumley, Freetown",
  );
});

test("different city -> seller city + country", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "Bo", country: "Sierra Leone" },
      sellerLocation: { community: "Lumley", city: "Freetown", country: "Sierra Leone" },
    }),
    "Freetown, Sierra Leone",
  );
});

test("same city -> popularName + city", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "New York City", country: "USA" },
      sellerLocation: { popularName: "Times Square", city: "New York City", country: "USA" },
    }),
    "Times Square, New York City",
  );
});

test("buyer has region but no city (Virginia, USA) -> seller city + country", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { region: "Virginia", country: "USA" },
      sellerLocation: { popularName: "Times Square", city: "New York City", country: "USA" },
    }),
    "New York City, USA",
  );
});

test("different country -> seller city + country", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "London", country: "United Kingdom" },
      sellerLocation: { popularName: "Times Square", city: "New York City", country: "USA" },
    }),
    "New York City, USA",
  );
});

test("buyer location unavailable -> seller city + country", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: null,
      sellerLocation: { community: "Lumley", city: "Freetown", country: "Sierra Leone" },
    }),
    "Freetown, Sierra Leone",
  );
});

test("same city, no community, has street -> street + city", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "Freetown", country: "Sierra Leone" },
      sellerLocation: { street: "Wilkinson Road", city: "Freetown", country: "Sierra Leone" },
    }),
    "Wilkinson Road, Freetown",
  );
});

// ---- Aliases, duplicates, privacy, fallbacks ------------------------------

test("city aliases: 'Freetown City' matches 'Freetown'", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "Freetown City", country: "Sierra Leone" },
      sellerLocation: { community: "Lumley", city: "Freetown", country: "Sierra Leone" },
    }),
    "Lumley, Freetown",
  );
});

test("city aliases: 'NYC' matches 'New York City'", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "NYC", country: "USA" },
      sellerLocation: { popularName: "Times Square", city: "New York City", country: "USA" },
    }),
    "Times Square, New York City",
  );
});

test("duplicate area/city collapses (Freetown, Freetown -> Freetown)", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "Freetown", country: "Sierra Leone" },
      sellerLocation: { community: "Freetown", city: "Freetown", country: "Sierra Leone" },
    }),
    "Freetown",
  );
});

test("no duplicated country (Freetown, Sierra Leone, Sierra Leone -> Freetown, Sierra Leone)", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "Bo", country: "Sierra Leone" },
      sellerLocation: { city: "Freetown", country: "Sierra Leone", region: "Sierra Leone" },
    }),
    "Freetown, Sierra Leone",
  );
});

test("seller city with an embedded country does not duplicate the country", () => {
  // Real-world messy data: the city field itself is "Lumley, Sierra Leone".
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "Bo", country: "Sierra Leone" },
      sellerLocation: { city: "Lumley, Sierra Leone", country: "Sierra Leone" },
    }),
    "Lumley, Sierra Leone",
  );
});

test("same-city local area with embedded city is not duplicated", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "Freetown", country: "Sierra Leone" },
      sellerLocation: { community: "Lumley, Freetown", city: "Freetown", country: "Sierra Leone" },
    }),
    "Lumley, Freetown",
  );
});

test("privacy: house number stripped from the local area", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "Freetown", country: "Sierra Leone" },
      sellerLocation: { community: "26a Grassfield", city: "Freetown", country: "Sierra Leone" },
    }),
    "Grassfield, Freetown",
  );
});

test("missing seller city -> region + country", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "Bo", country: "Sierra Leone" },
      sellerLocation: { region: "Western Area", country: "Sierra Leone" },
    }),
    "Western Area, Sierra Leone",
  );
});

test("missing seller city and region -> country only", () => {
  assert.equal(
    getProductCardLocation({
      buyerLocation: { city: "Bo", country: "Sierra Leone" },
      sellerLocation: { country: "Sierra Leone" },
    }),
    "Sierra Leone",
  );
});

// ---- Normalization + sameCity helpers -------------------------------------

test("normalizeCityKey handles City suffix and aliases", () => {
  assert.equal(normalizeCityKey("Freetown"), normalizeCityKey("Freetown City"));
  assert.equal(normalizeCityKey("New York"), normalizeCityKey("New York City"));
  assert.equal(normalizeCityKey("NYC"), normalizeCityKey("New York"));
});

test("normalizeCountryKey handles USA/US aliases", () => {
  assert.equal(normalizeCountryKey("USA"), normalizeCountryKey("United States"));
  assert.equal(normalizeCountryKey("US"), normalizeCountryKey("United States of America"));
});

test("sameCity uses stable place ids when both present", () => {
  assert.equal(
    sameCity({ city: "Freetown", cityPlaceId: "abc" }, { city: "Somewhere", cityPlaceId: "abc" }),
    true,
  );
  assert.equal(
    sameCity({ city: "Freetown", cityPlaceId: "abc" }, { city: "Freetown", cityPlaceId: "xyz" }),
    false,
  );
});

test("sameCity false when either city missing", () => {
  assert.equal(sameCity({ country: "USA" }, { city: "New York", country: "USA" }), false);
});

// ---- Adapter: derives area from saved address, never inventing --------------

test("buildCardSellerLocation derives community from address and strips house number", () => {
  const built = buildCardSellerLocation({
    address: "26a Grassfield, Lumley, Freetown, Sierra Leone",
    city: "Freetown",
    country: "Sierra Leone",
    latitude: 8.484,
    longitude: -13.268,
  });
  assert.equal(built.community, "Grassfield");
  assert.equal(built.city, "Freetown");
  assert.equal(built.country, "Sierra Leone");
  assert.equal(built.latitude, 8.484);
  // Full round-trip through the display helper for a same-city buyer.
  assert.equal(
    getProductCardLocation({ buyerLocation: { city: "Freetown", country: "Sierra Leone" }, sellerLocation: built }),
    "Grassfield, Freetown",
  );
});

test("buildCardSellerLocation with no smaller area yields city-only in same city", () => {
  const built = buildCardSellerLocation({ address: "Freetown, Sierra Leone", city: "Freetown", country: "Sierra Leone" });
  assert.equal(built.community, "");
  assert.equal(
    getProductCardLocation({ buyerLocation: { city: "Freetown", country: "Sierra Leone" }, sellerLocation: built }),
    "Freetown",
  );
});
