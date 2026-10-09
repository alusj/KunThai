import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPhotoMatches,
  expandPhotoSearchTerms,
  mergeListings,
  PHOTO_MATCH_LIMIT,
  photoFallbackResults,
  photoMatchListing,
  photoRecallQueries,
  rankPhotoCandidates,
} from "./photoSearch.js";
import { verticalAsPhotoCandidate } from "./verticalSearch.js";

// The real listing that photo search missed: a vendor's "Computer" in
// "Electricals", photographed as an open MacBook showing an app's forms.
const COMPUTER = {
  id: "computer-1",
  name: "Computer",
  category: "Electricals",
  description: "Clean used computer, 8GB RAM, good battery.",
  price: 4500,
  currency: "SLE",
  seller: { name: "Kamara Supplies", businessKind: "vendor" },
};
const KETTLE = { id: "kettle", name: "Electric kettle 2L", category: "Electricals", price: 150, currency: "SLE", seller: { name: "Home Shop" } };
const BAG = { id: "bag", name: "Leather handbag", category: "Fashion", price: 300, currency: "SLE", seller: { name: "Style" } };
const RICE = { id: "rice", name: "Parboiled rice 25kg", category: "Food", price: 600, currency: "SLE", seller: { name: "Wholesale" } };
const DELL = { id: "dell", name: "Dell Latitude", category: "Computers", description: "Business notebook, Windows 11", brand: "Dell", price: 3800, currency: "SLE" };

// What the server now returns for that photo (see server imageSearchRules).
const LAPTOP_PHOTO = {
  found: true,
  photoType: "physical_object",
  objectType: "laptop",
  deviceWithScreen: true,
  name: "Apple MacBook Pro",
  category: "Electronics",
  brand: "Apple",
  searchTerms: ["MacBook Pro", "MacBook", "laptop", "notebook computer", "computer", "Electronics"],
};

test("a laptop photo expands to computer/notebook and the Electricals shelf", () => {
  const terms = expandPhotoSearchTerms(LAPTOP_PHOTO);
  const words = terms.map((entry) => entry.term.toLowerCase());
  for (const word of ["macbook pro", "laptop", "computer", "notebook", "electricals", "electronics"]) {
    assert.ok(words.includes(word), `${word} in ${words.join(", ")}`);
  }
  assert.equal(terms[0].term, "MacBook Pro", "the most specific word leads");
  const category = terms.find((entry) => entry.term.toLowerCase() === "electricals");
  assert.equal(category.kind, "category");
  assert.ok(category.weight < terms[0].weight);
  assert.equal(terms.find((entry) => entry.term === "Apple").kind, "brand");
});

test("the generic 'Computer' listing is found and ranked above other Electricals", () => {
  const ranked = rankPhotoCandidates([KETTLE, BAG, RICE, COMPUTER, DELL], expandPhotoSearchTerms(LAPTOP_PHOTO));
  const ids = ranked.map((entry) => entry.product.id);
  assert.equal(ids[0], "computer-1");
  assert.ok(ids.includes("dell"), "another laptop is a candidate too");
  assert.ok(ranked.find((entry) => entry.product.id === "computer-1").strong);
  const kettle = ranked.find((entry) => entry.product.id === "kettle");
  assert.ok(!kettle || !kettle.strong, "a category-only hit is never a strong match");
  assert.ok(!ids.includes("rice") && !ids.includes("bag"));
});

test("the same photo with only one label still finds it (no single-label dependency)", () => {
  for (const identified of [
    { objectType: "laptop", searchTerms: ["laptop"] },
    { objectType: "notebook", searchTerms: ["notebook"] },
    { objectType: "computer", searchTerms: ["MacBook"] },
    { name: "Laptop", category: "Electronics", searchTerms: [] },
  ]) {
    const ranked = rankPhotoCandidates([KETTLE, BAG, COMPUTER], expandPhotoSearchTerms(identified));
    assert.equal(ranked[0]?.product.id, "computer-1", JSON.stringify(identified));
  }
});

test("an accessory word does not expand into the device", () => {
  const words = expandPhotoSearchTerms({ objectType: "laptop bag", searchTerms: ["laptop bag", "backpack"] }).map((entry) => entry.term);
  assert.ok(!words.includes("computer"));
});

test("meals and property are candidates when the photo is food or a building", () => {
  const meal = verticalAsPhotoCandidate({ type: "restaurant", item: { id: "m1", name: "Chicken shwarma", description: "", currency: "SLE", price: 60 } });
  const flat = verticalAsPhotoCandidate({ type: "property", item: { id: "f1", title: "Two bedroom flat", property_type: "apartment", purpose: "rent", currency: "SLE", price: 3000, image_urls: [] } });
  const food = rankPhotoCandidates([COMPUTER, meal, flat], expandPhotoSearchTerms({ objectType: "shawarma", searchTerms: ["shawarma"], category: "Food" }));
  assert.equal(food[0].product.id, "restaurant:m1");
  const building = rankPhotoCandidates([COMPUTER, meal, flat], expandPhotoSearchTerms({ objectType: "apartment", searchTerms: ["apartment building"], category: "Property" }));
  assert.equal(building[0].product.id, "property:f1");
});

test("fallback shows only strong matches when KAI's matching picks nothing", () => {
  const ranked = rankPhotoCandidates([KETTLE, COMPUTER], expandPhotoSearchTerms(LAPTOP_PHOTO));
  const fallback = photoFallbackResults(ranked);
  assert.deepEqual(fallback.map((entry) => [entry.product.id, entry.level]), [["computer-1", "similar"]]);
  assert.deepEqual(applyPhotoMatches(ranked.map((entry) => entry.product), []), []);
});

test("server recall searches the specific word and the object type with synonyms", () => {
  const queries = photoRecallQueries(LAPTOP_PHOTO);
  assert.equal(queries[0], "MacBook Pro");
  assert.match(queries[1], /^laptop /);
  assert.match(queries[1], /computer/);
  assert.ok(queries.length <= 2);
  assert.deepEqual(photoRecallQueries({}), []);
});

test("recalled listings merge with the catalogue once each", () => {
  const merged = mergeListings([COMPUTER, KETTLE], [{ ...COMPUTER, name: "dup" }, DELL], [null, { id: "" }]);
  assert.deepEqual(merged.map((product) => product.id), ["computer-1", "kettle", "dell"]);
  assert.equal(merged[0].name, "Computer");
});

test("KAI's comparison record says whether a listing is a vendor product, shop product or meal", () => {
  assert.equal(photoMatchListing(COMPUTER).listingKind, "vendor product");
  assert.equal(photoMatchListing(KETTLE).listingKind, "shop product");
  const meal = verticalAsPhotoCandidate({ type: "restaurant", item: { id: "m1", name: "Jollof", currency: "SLE", price: 60 } });
  assert.equal(photoMatchListing(meal).listingKind, "restaurant");
  const tagged = photoMatchListing({ ...KETTLE, details: { tags: ["kettle", "boiler"] } });
  assert.equal(tagged.keywords, "kettle, boiler");
});

test("the listings compared with the photo fit the matching step's data block", () => {
  const long = "x".repeat(500);
  const listings = Array.from({ length: PHOTO_MATCH_LIMIT }, (_, index) => photoMatchListing({
    ...COMPUTER,
    id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
    name: long,
    description: long,
    brand: long,
    model: long,
    details: { tags: long },
  }));
  // urmall.image_match caps its listings block at 12,000 characters.
  assert.ok(JSON.stringify(listings).length < 12_000);
});
