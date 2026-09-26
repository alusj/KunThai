import assert from "node:assert/strict";
import test from "node:test";

import { applyPhotoMatches, photoMatchListing, photoSearchCandidates } from "./photoSearch.js";

const PRODUCTS = [
  { id: "a", name: "Tecno Spark 20 smartphone", category: "Phones", brand: "Tecno", price: 1850, currency: "SLE", description: "New phone" },
  { id: "b", name: "Samsung Galaxy A15", category: "Phones", brand: "Samsung", price: 2400, currency: "SLE" },
  { id: "c", name: "Leather sandals", category: "Shoes", price: 300, currency: "SLE" },
  { id: "d", name: "Phone case for Tecno Spark", category: "Accessories", price: 90, currency: "SLE" },
];

test("the most specific search word ranks the exact product first", () => {
  const candidates = photoSearchCandidates(PRODUCTS, ["Tecno Spark 20", "smartphone", "phone"]);
  assert.equal(candidates[0].id, "a");
  assert.ok(!candidates.some((product) => product.id === "c"), "unrelated listings are not candidates");
});

test("no search words means no candidates", () => {
  assert.deepEqual(photoSearchCandidates(PRODUCTS, []), []);
  assert.deepEqual(photoSearchCandidates(PRODUCTS, ["", "  "]), []);
});

test("KAI gets the exact price label, never a raw number to reformat", () => {
  const listing = photoMatchListing({ ...PRODUCTS[0], discountPrice: 1700 });
  assert.equal(listing.id, "a");
  assert.equal(typeof listing.priceLabel, "string");
  assert.match(listing.priceLabel, /1,700/);
});

test("only real candidates come back, once each, in KAI's order", () => {
  const results = applyPhotoMatches(PRODUCTS, [
    { id: "b", level: "similar", reason: "Same kind of phone." },
    { id: "zzz", level: "exact", reason: "Invented." },
    { id: "a", level: "exact", reason: "Same model." },
    { id: "b", level: "exact", reason: "Duplicate." },
  ]);
  assert.deepEqual(results.map((r) => [r.product.id, r.level]), [["b", "similar"], ["a", "exact"]]);
});
