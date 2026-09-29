import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  rankMarketplaceSearch,
  rankVerticalEntries,
  verticalAsPhotoCandidate,
  verticalEntriesFrom,
} from "./verticalSearch.js";
import { photoSearchCandidates, photoSearchTerms } from "./photoSearch.js";

const SHAWARMA = { type: "restaurant", item: { id: "m1", name: "Chicken Shawarma", description: "Wrap with garlic sauce", businessName: "Grill House", price: 60, currency: "SLE", image_url: "https://x/shawarma.jpg" } };
const BURGER = { type: "restaurant", item: { id: "m2", name: "Hamburger", description: "Beef patty", businessName: "Grill House", price: 100, currency: "SLE" } };
const FLAT = { type: "property", item: { id: "p1", title: "Two bedroom flat", description: "Quiet street", property_type: "apartment", purpose: "rent", price: 900 } };
const HOTEL = { type: "hotel", item: { id: "h1", businessName: "Harbour Inn", fromPrice: 400, rooms: [{ name: "Deluxe room" }], images: ["https://x/h.jpg"] } };
const ENTRIES = [SHAWARMA, BURGER, FLAT, HOTEL];

const VENDOR_RICE = { id: "v1", name: "Rice 50kg bag", category: "Groceries", description: "Bulk rice", seller: { name: "Supply Co", businessKind: "vendor" } };
const SHOP_PHONE = { id: "r1", name: "Smartphone X", category: "Phones", seller: { name: "Phone Shop", businessKind: "retail" } };

test("a misspelled dish still finds the meal (sharwama -> Shawarma)", () => {
  const ranked = rankVerticalEntries(ENTRIES, "sharwama");
  assert.equal(ranked[0]?.item.id, "m1");
  assert.ok(!ranked.some((entry) => entry.item.id === "p1"), "unrelated listings are dropped");
});

test("kind words find listings whose own text never says them", () => {
  assert.equal(rankVerticalEntries(ENTRIES, "hotel")[0]?.item.id, "h1");
  assert.ok(rankVerticalEntries(ENTRIES, "food").some((entry) => entry.item.id === "m2"));
  assert.ok(rankVerticalEntries(ENTRIES, "apartment").some((entry) => entry.item.id === "p1"));
});

test("one ranked search covers shop products, vendor products and meals", () => {
  const rows = rankMarketplaceSearch([VENDOR_RICE, SHOP_PHONE], ENTRIES, "rice");
  assert.equal(rows[0].kind, "retail");
  assert.equal(rows[0].product.id, "v1", "vendor products are searchable like shop products");
  const meal = rankMarketplaceSearch([VENDOR_RICE, SHOP_PHONE], ENTRIES, "shawarma");
  assert.deepEqual(meal[0], { kind: "vertical", type: "restaurant", item: SHAWARMA.item });
  assert.deepEqual(rankMarketplaceSearch([SHOP_PHONE], ENTRIES, "s"), [], "too-short queries return nothing");
});

test("photo search can match a menu item, not only products", () => {
  const candidates = photoSearchCandidates(
    [SHOP_PHONE, ...ENTRIES.map(verticalAsPhotoCandidate)],
    photoSearchTerms({ searchTerms: ["shawarma", "wrap"], name: "Chicken shawarma", category: "food" }),
  );
  assert.equal(candidates[0].id, "restaurant:m1");
  assert.equal(candidates[0].vertical.item.id, "m1", "the result opens the real meal");
  assert.equal(candidates[0].imageUrl, "https://x/shawarma.jpg");
});

test("photo search terms keep KAI's words first and add the name as a safety net", () => {
  assert.deepEqual(photoSearchTerms({ searchTerms: ["burger", "Burger"], name: "Hamburger", category: "" }), ["burger", "Hamburger"]);
});

test("vertical discovery flattens into typed entries", () => {
  const entries = verticalEntriesFrom({ restaurants: [BURGER.item], hotels: [HOTEL.item], properties: [FLAT.item] });
  assert.deepEqual(entries.map((entry) => entry.type), ["restaurant", "hotel", "property"]);
});

test("KAI's suggested prompts are not tied to one country", () => {
  const translations = readFileSync(new URL("../../../i18n/translations.js", import.meta.url), "utf8");
  const promptLines = translations.split(/\r?\n/).filter((line) => /"?(buyer|passenger|global|explore)\d"?:/.test(line));
  assert.ok(promptLines.length >= 8);
  for (const line of promptLines) {
    assert.doesNotMatch(line, /Lumley|Freetown|Sierra Leone|\bLe \d|\d Le\b|ليون|利昂/, line.trim());
  }
});
