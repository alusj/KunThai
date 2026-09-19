import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSearchVariants,
  isStrongAddressMatch,
  photonFeatureToPlace,
  stripHouseNumber,
} from "./locationSearchService.js";

const ADDRESS = "26a Grassfield, Lumley, Freetown, Sierra Leone";

test("house numbers are dropped, the community / town / country are kept", () => {
  assert.equal(stripHouseNumber(ADDRESS), "Grassfield, Lumley, Freetown, Sierra Leone");
  assert.equal(stripHouseNumber("No. 5 Kroo Street, Freetown"), "Kroo Street, Freetown");
  assert.equal(stripHouseNumber("12-14 Wilkinson Road"), "Wilkinson Road");
  assert.equal(stripHouseNumber("Lumley, Freetown"), "Lumley, Freetown");
});

test("fallback searches never search the street or number on their own", () => {
  const variants = buildSearchVariants(ADDRESS);
  assert.ok(variants.includes("Grassfield, Lumley, Freetown, Sierra Leone"));
  assert.ok(variants.includes("Lumley, Freetown, Sierra Leone"));
  for (const variant of variants) {
    assert.match(variant, /Lumley/, `"${variant}" keeps the community`);
    assert.notEqual(variant, "26a Grassfield");
  }
});

test("a same-named street in another country is not a strong match", () => {
  const lumley = { name: "Grassfield Community Football Field", address: "Lumley, Freetown, Western Area", country: "Sierra Leone" };
  const virginia = { name: "Grassfield", address: "Chesapeake, Virginia", country: "United States" };
  assert.equal(isStrongAddressMatch(lumley, ADDRESS), true);
  assert.equal(isStrongAddressMatch(virginia, ADDRESS), false);
});

test("Photon results become places with exact coordinates and distance", () => {
  const place = photonFeatureToPlace({
    geometry: { coordinates: [-13.2161, 8.4836] },
    properties: { osm_type: "W", osm_id: 42, name: "Manfred Lane", district: "Mount Aureol", city: "Bambara Town Community", country: "Sierra Leone", countrycode: "SL" },
  }, { lat: 8.458, lng: -13.262 });
  assert.equal(place.name, "Manfred Lane");
  assert.equal(place.lat, 8.4836);
  assert.equal(place.lng, -13.2161);
  assert.equal(place.countryCode, "sl");
  assert.match(place.fullAddress, /Mount Aureol/);
  assert.ok(place.distanceMeters > 5000 && place.distanceMeters < 6500);
});
