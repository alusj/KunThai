import assert from "node:assert/strict";
import test from "node:test";

import {
  matchCategory,
  productFactsForAi,
  readBuyerCoordinates,
  resolveBudget,
  reviewFactsForAi,
  sortByDistance,
  verticalFactsForAi,
} from "./urmallAiModels.js";

const PRODUCT = {
  id: "p1",
  name: "Tecno Spark 20",
  description: "Brand new phone with 50MP camera.",
  price: 2000,
  discountPrice: 1850,
  currency: "SLE",
  category: "Phones",
  condition: "new",
  stock: 3,
  deliveryAvailable: true,
  pickupAvailable: false,
  deliveryTime: "1-2 days",
  allowNegotiation: true,
  reviewCount: 0,
  rating: 0,
  details: { storage: "128GB", tierPricing: [{ min: 5 }] },
  seller: {
    name: "Freetown Phones",
    city: "Freetown",
    phone: "+23276000000",
    email: "owner@example.com",
    whatsapp: "+23276000000",
    address: "12 Siaka Stevens St",
    verificationStatus: "verified",
    latitude: 8.4844,
    longitude: -13.2344,
  },
};

test("a budget in another currency is never converted or applied", () => {
  assert.deepEqual(resolveBudget({ maxPrice: 300, budgetCurrency: "USD" }, "SLE"), {
    apply: false,
    minPrice: null,
    maxPrice: null,
    mismatch: { budgetCurrency: "USD", listingCurrency: "SLE", priceFilterApplied: false },
    sortCheapestFirst: true,
  });
  const local = resolveBudget({ maxPrice: 3000, budgetCurrency: "SLE" }, "SLE");
  assert.equal(local.apply, true);
  assert.equal(local.maxPrice, 3000);
  // No currency given: the number is read as the local market's currency.
  assert.equal(resolveBudget({ maxPrice: 3000 }, "SLE").apply, true);
  assert.equal(resolveBudget({}, "SLE").apply, false);
});

test("only categories that really exist are used", () => {
  const categories = ["Phones & Tablets", "Shoes", "Groceries"];
  assert.equal(matchCategory("shoes", categories), "Shoes");
  assert.equal(matchCategory("phones", categories), "Phones & Tablets");
  assert.equal(matchCategory("spaceships", categories), "");
});

test("listing facts carry exact price labels and no private seller contact details", () => {
  const facts = productFactsForAi(PRODUCT, { buyer: { latitude: 8.4844, longitude: -13.2344 }, detail: true });
  const json = JSON.stringify(facts);
  assert.ok(facts.priceLabel.includes("1,850"));
  assert.ok(facts.originalPriceLabel.includes("2,000"));
  assert.equal(facts.stockLeft, 3);
  assert.equal(facts.deliveryTimeStatedBySeller, "1-2 days");
  assert.equal(facts.sellerVerified, true);
  assert.equal(facts.distanceKm, 0);
  assert.equal(facts.rating, undefined, "no rating is invented when there are no reviews");
  for (const secret of ["+23276000000", "owner@example.com", "Siaka Stevens"]) {
    assert.ok(!json.includes(secret), `${secret} must not reach the model`);
  }
  assert.equal(facts.attributes.storage, "128GB");
  assert.equal(facts.attributes.tierPricing, undefined);
});

test("distance is only stated when both locations are really known", () => {
  assert.equal(productFactsForAi(PRODUCT).distanceKm, undefined);
  assert.equal(productFactsForAi({ ...PRODUCT, seller: { ...PRODUCT.seller, latitude: null } }, { buyer: { latitude: 8.4, longitude: -13.2 } }).distanceKm, undefined);
});

test("buyer location is read from KunThai's own cache and never guessed", () => {
  const storage = (values) => ({ getItem: (key) => values[key] ?? null });
  assert.equal(readBuyerCoordinates(storage({})), null);
  assert.deepEqual(
    readBuyerCoordinates(storage({ "kunthai.buyerLocation.v1": JSON.stringify({ latitude: 8.48, longitude: -13.23 }) })),
    { latitude: 8.48, longitude: -13.23 },
  );
  assert.equal(readBuyerCoordinates(storage({ "kunthai.buyerLocation.v1": JSON.stringify({ latitude: 0, longitude: 0 }) })), null);
});

test("nearest first, with unknown locations kept at the end", () => {
  const buyer = { latitude: 8.48, longitude: -13.23 };
  const entries = [
    { id: "far", latitude: 9.5, longitude: -13.0 },
    { id: "unknown" },
    { id: "near", latitude: 8.481, longitude: -13.231 },
  ];
  assert.deepEqual(sortByDistance(entries, (entry) => entry, buyer).map((entry) => entry.id), ["near", "far", "unknown"]);
  assert.deepEqual(sortByDistance(entries, (entry) => entry, null).map((entry) => entry.id), ["far", "unknown", "near"]);
});

test("review facts keep ratings and comments but drop reviewer names", () => {
  const facts = reviewFactsForAi({ reviewCount: 2, reviews: [{ rating: 5, comment: "Great", buyerName: "Amara" }, { rating: 3, comment: "", buyerName: "Sorie" }] });
  assert.equal(facts.averageRating, 4);
  assert.ok(!JSON.stringify(facts).includes("Amara"));
});

test("hotel and property prices are labelled with their real period", () => {
  const hotel = verticalFactsForAi("hotel", { id: "h1", businessName: "Lumley Inn", fromPrice: 500, currency: "SLE", rooms: [{}, {}] });
  assert.match(hotel.priceLabel, /^from .* per night$/);
  const property = verticalFactsForAi("property", { id: "x1", title: "2 bed flat", price: 4000, currency: "SLE", rent_period: "month", purpose: "rent" });
  assert.match(property.priceLabel, /per month$/);
});
