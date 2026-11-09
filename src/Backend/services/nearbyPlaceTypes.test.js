import assert from "node:assert/strict";
import test from "node:test";

import {
  ADD_LOCATION_CATEGORIES,
  NEARBY_PLACE_TYPES,
  approvedPlaceToSearchResult,
  matchApprovedPlaces,
  placeIconSvg,
  placeTypeForCategory,
  placeTypeForLocation,
} from "./nearbyPlaceTypes.js";

test("every Add Location option has its own icon and a filter", () => {
  assert.equal(ADD_LOCATION_CATEGORIES.at(-1), "Other");
  assert.ok(ADD_LOCATION_CATEGORIES.includes("Garage / Tyre Repair"));
  assert.equal(new Set(NEARBY_PLACE_TYPES.map((place) => place.icon)).size, NEARBY_PLACE_TYPES.length);
  for (const category of ADD_LOCATION_CATEGORIES) {
    const place = placeTypeForCategory(category);
    assert.equal(place.category, category);
    assert.ok(place.filter, category);
    assert.match(placeIconSvg(place), /^<svg .*<\/svg>$/, category);
  }
});

test("a typed Other name finds the right kind, without false matches", () => {
  assert.equal(placeTypeForCategory("Kamara Tyre Shop").category, "Shop");
  assert.equal(placeTypeForCategory("Vulcanizer").category, "Garage / Tyre Repair");
  assert.equal(placeTypeForCategory("Treatment centre").category, "Other");
  assert.equal(placeTypeForCategory("").category, "Other");
  assert.equal(placeTypeForLocation({ type: "Hotel / Safe Stay", category: "Services" }).icon, "hotel");
});

test("approved places are found by name or kind", () => {
  const garage = { id: "1", name: "Sulaiman Motors", type: "Garage / Tyre Repair", lat: 8.4, lng: -13.2, address: "Wilkinson Road" };
  const hotel = { id: "2", name: "Bintumani", type: "Hotel / Safe Stay", lat: 8.5, lng: -13.3 };
  const noPoint = { id: "3", name: "Sulaiman Lodge", type: "Hotel / Safe Stay" };
  const places = [garage, hotel, noPoint];
  assert.deepEqual(matchApprovedPlaces(places, "car repair"), [garage]);
  assert.deepEqual(matchApprovedPlaces(places, "hotel"), [hotel]);
  assert.deepEqual(matchApprovedPlaces(places, "sulaiman"), [garage]);
  assert.deepEqual(matchApprovedPlaces(places, "wilkinson"), [garage]);
  assert.deepEqual(matchApprovedPlaces(places, "a"), []);
  assert.equal(approvedPlaceToSearchResult(garage).id, "kunthai-1");
  assert.equal(approvedPlaceToSearchResult(garage).address, "Wilkinson Road");
});
