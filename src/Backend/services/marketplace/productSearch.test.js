import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeSearchQuery,
  tokenize,
  scoreProduct,
  rankSearchResults,
  buildProductRecallFilter,
  buildRelaxedRecallFilter,
  buildSearchSuggestions,
  MIN_QUERY_LENGTH,
} from "./productSearch.js";

// ---- Fixtures: mapBuyerProduct-shaped products --------------------------
function product(overrides) {
  return {
    id: overrides.id,
    name: "",
    brand: "",
    model: "",
    category: "General",
    description: "",
    details: {},
    condition: "new",
    price: 100,
    sales: 0,
    views: 0,
    rating: 0,
    createdAt: "2026-01-01T00:00:00Z",
    seller: { id: `s-${overrides.id}`, name: "A Store" },
    ...overrides,
  };
}

const iphone15 = product({ id: "p1", name: "iPhone 15", brand: "Apple", model: "15", category: "Phones" });
const iphone15pro = product({ id: "p2", name: "Apple iPhone 15 Pro", brand: "Apple", model: "15 Pro", category: "Phones" });
const iphone15promax = product({ id: "p3", name: "iPhone 15 Pro Max", brand: "Apple", model: "15 Pro Max", category: "Phones" });
const samsungPhone = product({ id: "p4", name: "Samsung Galaxy S24", brand: "Samsung", model: "S24", category: "Phones" });
// A product whose ONLY link to "phone" is its category, not its title.
const phoneCase = product({ id: "p5", name: "Silicone Cover", category: "Phones", description: "Fits many phones" });
const rice = product({ id: "p6", name: "25kg Parboiled Rice", category: "Food" });
const localRice = product({ id: "p7", name: "Premium Local Rice", category: "Food" });
const headphone = product({ id: "p8", name: "Sony Headphone WH-1000", brand: "Sony", category: "Audio" });
const fridge = product({ id: "p9", name: "Hisense Refrigerator 300L", brand: "Hisense", category: "Appliances" });
const shoe = product({ id: "p10", name: "Nike Air Force 1", brand: "Nike", model: "Air Force 1", category: "Shoes" });
const descOnly = product({ id: "p11", name: "Portable Blender", description: "Comes with a stainless steel jug and travel lid", category: "Kitchen" });

const CATALOG = [
  iphone15, iphone15pro, iphone15promax, samsungPhone, phoneCase,
  rice, localRice, headphone, fridge, shoe, descOnly,
];

// ---- Normalization ------------------------------------------------------
test("normalizeSearchQuery trims, collapses spaces and lowercases", () => {
  assert.equal(normalizeSearchQuery("  iPhone   15  "), "iphone 15");
  assert.equal(normalizeSearchQuery("IPHONE"), "iphone");
});

test("normalizeSearchQuery flattens hyphens and strips punctuation", () => {
  assert.equal(normalizeSearchQuery("i-phone"), "i phone");
  assert.equal(normalizeSearchQuery("i.phone!!"), "i phone");
  assert.equal(normalizeSearchQuery("Nike, Air-Force (1)"), "nike air force 1");
});

test("tokenize splits normalized query", () => {
  assert.deepEqual(tokenize("  Air-Force 1 "), ["air", "force", "1"]);
  assert.deepEqual(tokenize("   "), []);
});

// ---- Exact / prefix / contains name ranking -----------------------------
test("exact product title outranks a category-only match", () => {
  const ranked = rankSearchResults(CATALOG, "iPhone 15");
  // The exact/prefixed iPhone products must all come before the phone case,
  // which matches only via its "Phones" category.
  const casePos = ranked.findIndex((p) => p.id === phoneCase.id);
  ["p1", "p2", "p3"].forEach((id) => {
    const pos = ranked.findIndex((p) => p.id === id);
    assert.ok(pos !== -1 && pos < casePos, `${id} should rank before the category-only case`);
  });
  assert.equal(ranked[0].id, "p1", "exact 'iPhone 15' ranks first");
});

test("case-insensitive: IPHONE and iphone return the same ranking", () => {
  const upper = rankSearchResults(CATALOG, "IPHONE").map((p) => p.id);
  const lower = rankSearchResults(CATALOG, "iphone").map((p) => p.id);
  assert.deepEqual(upper, lower);
  assert.ok(upper.includes("p1"));
});

test("extra spaces and hyphen/punctuation variants match the same product", () => {
  for (const q of ["iPhone 15", "  iPhone   15 ", "i-phone 15", "iphone15"]) {
    const ids = rankSearchResults(CATALOG, q).map((p) => p.id);
    assert.ok(ids.includes("p1"), `query "${q}" should surface iPhone 15`);
  }
});

// ---- Partial word -------------------------------------------------------
test("partial word 'iph' surfaces iPhone products", () => {
  const ids = rankSearchResults(CATALOG, "iph").map((p) => p.id);
  assert.ok(ids.includes("p1") && ids.includes("p2"));
});

// ---- Brand + model ------------------------------------------------------
test("brand + model query matches the product", () => {
  const ids = rankSearchResults(CATALOG, "Nike Air Force 1").map((p) => p.id);
  assert.equal(ids[0], "p10");
});

test("brand-only query (samsung) matches the branded product", () => {
  const ids = rankSearchResults(CATALOG, "samsung").map((p) => p.id);
  assert.ok(ids.includes("p4"));
});

// ---- Category & description --------------------------------------------
test("rice returns rice products even though the category is Food", () => {
  const ids = rankSearchResults(CATALOG, "rice").map((p) => p.id);
  assert.ok(ids.includes("p6") && ids.includes("p7"));
  // The rice-named products, not Food category noise, lead.
  assert.ok(["p6", "p7"].includes(ids[0]));
});

test("category query 'electronics'-style term matches category products", () => {
  const ids = rankSearchResults(CATALOG, "phones").map((p) => p.id);
  // Everything in the Phones category (incl. the case) is a valid result.
  assert.ok(ids.includes("p5"));
  assert.ok(ids.includes("p1"));
});

test("description-only match still returns the product", () => {
  const ids = rankSearchResults(CATALOG, "stainless steel").map((p) => p.id);
  assert.deepEqual(ids, ["p11"]);
});

// ---- Plural / singular --------------------------------------------------
test("plural and singular forms return the same product", () => {
  assert.ok(rankSearchResults(CATALOG, "headphones").map((p) => p.id).includes("p8"));
  assert.ok(rankSearchResults(CATALOG, "headphone").map((p) => p.id).includes("p8"));
});

// ---- Typo tolerance -----------------------------------------------------
test("typos still return useful products, ranked below exact matches", () => {
  assert.ok(rankSearchResults(CATALOG, "iphon").map((p) => p.id).includes("p1"), "iphon -> iPhone");
  assert.ok(rankSearchResults(CATALOG, "samsng").map((p) => p.id).includes("p4"), "samsng -> Samsung");
  assert.ok(rankSearchResults(CATALOG, "headpone").map((p) => p.id).includes("p8"), "headpone -> headphone");
  assert.ok(rankSearchResults(CATALOG, "refridgerator").map((p) => p.id).includes("p9"), "refridgerator -> refrigerator");
});

test("exact match outranks a fuzzy match for the same term", () => {
  const exact = scoreProduct(iphone15, "iphone 15");
  const fuzzy = scoreProduct(iphone15, "iphon 15");
  assert.ok(exact > fuzzy, "exact query scores higher than a typo'd query");
});

// ---- Empty / no-results -------------------------------------------------
test("empty query returns the list unchanged (no ranking applied)", () => {
  const ranked = rankSearchResults(CATALOG, "   ");
  assert.equal(ranked.length, CATALOG.length);
});

test("unknown product yields no results", () => {
  assert.deepEqual(rankSearchResults(CATALOG, "zxqwlkjhgf").map((p) => p.id), []);
});

test("a single unrelated letter inside a word does not match everything", () => {
  // "a" is below MIN_QUERY_LENGTH and must not turn into a match-all.
  assert.equal(MIN_QUERY_LENGTH, 2);
  assert.deepEqual(rankSearchResults(CATALOG, "a"), [...CATALOG]);
});

// ---- Recall filter (DB) -------------------------------------------------
test("buildProductRecallFilter searches all key fields, safely escaped", () => {
  const filter = buildProductRecallFilter("iPhone 15");
  assert.ok(filter.includes("name.ilike"));
  assert.ok(filter.includes("brand.ilike"));
  assert.ok(filter.includes("model.ilike"));
  assert.ok(filter.includes("category.ilike"));
  assert.ok(filter.includes("description.ilike"));
  // No stray commas/parens that could break the PostgREST or() grammar.
  assert.ok(!filter.includes("("));
  assert.equal(buildProductRecallFilter("a"), "");
});

test("buildRelaxedRecallFilter uses a short prefix of the longest token", () => {
  const filter = buildRelaxedRecallFilter("samsng");
  assert.ok(filter.includes("*sam*"));
  assert.equal(buildRelaxedRecallFilter("tv"), "");
});

// ---- Typed suggestions --------------------------------------------------
test("suggestions are product-first with correct types", () => {
  const suggestions = buildSearchSuggestions({
    products: CATALOG,
    categories: ["Phones", "Food"],
    stores: [{ id: "st1", name: "Phone World" }],
    locations: ["Freetown"],
    rawQuery: "phone",
  });
  assert.equal(suggestions[0].type, "product", "first suggestion is a product");
  assert.ok(suggestions.some((s) => s.type === "category" && s.value === "Phones"));
  assert.ok(suggestions.some((s) => s.type === "store" && s.value === "st1"));
});

test("suggestions are empty below the minimum query length", () => {
  assert.deepEqual(buildSearchSuggestions({ products: CATALOG, rawQuery: "i" }), []);
});
