import test from "node:test";
import assert from "node:assert/strict";

import {
  rankMarketplacePromotionsForBuyer,
  rankMarketplaceProductsNearby,
  rankSimilarMarketplaceProducts,
  rankSimilarVerticalListings,
} from "./marketplaceDiscovery.js";

function product(id, overrides = {}) {
  return {
    id,
    name: id,
    category: "General",
    price: 100,
    stock: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    seller: { id: `seller-${id}`, city: "Freetown", countryCode: "SL" },
    ...overrides,
  };
}

test("nearby discovery ranks distance before popularity", () => {
  const nearby = product("nearby", { seller: { id: "near", latitude: 8.48, longitude: -13.23, countryCode: "SL" } });
  const farPopular = product("far", {
    sales: 1000,
    views: 10000,
    seller: { id: "far", latitude: 9.5, longitude: -12.0, countryCode: "SL" },
  });

  const ranked = rankMarketplaceProductsNearby([farPopular, nearby], {
    latitude: 8.484,
    longitude: -13.234,
    countryCode: "SL",
  });

  assert.deepEqual(ranked.map((item) => item.id), ["nearby", "far"]);
  assert.ok(ranked[0].distanceKm < ranked[1].distanceKm);
});

test("nearby discovery falls back to same city when coordinates are unavailable", () => {
  const sameCountry = product("country", { seller: { id: "country", city: "Bo", countryCode: "SL" } });
  const sameCity = product("city", { seller: { id: "city", city: "Freetown", countryCode: "SL" } });

  const ranked = rankMarketplaceProductsNearby([sameCountry, sameCity], { city: "Freetown", countryCode: "SL" });
  assert.deepEqual(ranked.map((item) => item.id), ["city", "country"]);
});

test("promotion audiences affect delivery order without dropping active campaigns", () => {
  const countrywide = product("countrywide", { promotionAudience: "countrywide", promotionCredits: 5 });
  const farNearby = product("far-nearby", {
    promotionAudience: "nearby",
    promotionCredits: 20,
    seller: { id: "far-nearby", latitude: 9.5, longitude: -12, countryCode: "SL" },
  });
  const localNearby = product("local-nearby", {
    promotionAudience: "nearby",
    promotionCredits: 5,
    seller: { id: "local-nearby", latitude: 8.48, longitude: -13.23, countryCode: "SL" },
  });
  const recommended = product("recommended", { promotionAudience: "recommended", views: 50 });

  const ranked = rankMarketplacePromotionsForBuyer(
    [countrywide, farNearby, recommended, localNearby],
    { latitude: 8.484, longitude: -13.234, countryCode: "SL" },
  );

  assert.deepEqual(ranked.map((item) => item.id), ["local-nearby", "recommended", "countrywide", "far-nearby"]);
  assert.equal(ranked.length, 4);
});

test("similar recommendations favor category, brand and price while excluding the open product", () => {
  const current = product("current", { name: "MacBook Air", category: "Electronics", brand: "Apple", price: 1000 });
  const closeMatch = product("close", { name: "MacBook Pro", category: "Electronics", brand: "Apple", price: 1100 });
  const categoryMatch = product("category", { name: "Laptop", category: "Electronics", price: 900 });
  const unrelated = product("unrelated", { name: "Lunch", category: "Restaurant", price: 10 });

  const ranked = rankSimilarMarketplaceProducts(current, [unrelated, current, categoryMatch, closeMatch]);
  assert.deepEqual(ranked.map((item) => item.id), ["close", "category", "unrelated"]);
});

test("restaurant recommendations stay within restaurant inventory and favor nearby meals", () => {
  const current = product("meal-current", { verticalType: "restaurant", category: "Restaurant meal", name: "Jollof rice" });
  const nearbyMeal = product("meal-near", {
    verticalType: "restaurant",
    category: "Restaurant meal",
    name: "Chicken jollof rice",
    seller: { id: "restaurant-near", latitude: 8.48, longitude: -13.23, countryCode: "SL" },
  });
  const farMeal = product("meal-far", {
    verticalType: "restaurant",
    category: "Restaurant meal",
    name: "Jollof platter",
    seller: { id: "restaurant-far", latitude: 9.5, longitude: -12, countryCode: "SL" },
  });
  const property = product("property", { verticalType: "property", category: "Property for rent" });

  const ranked = rankSimilarVerticalListings(
    current,
    [property, farMeal, current, nearbyMeal],
    { latitude: 8.484, longitude: -13.234, countryCode: "SL" },
  );

  assert.deepEqual(ranked.map((item) => item.id), ["meal-near", "meal-far"]);
});

test("property recommendations never include meals or retail products", () => {
  const current = product("property-current", { verticalType: "property", category: "Property for rent" });
  const property = product("property-match", { verticalType: "property", category: "Property for rent" });
  const meal = product("meal", { verticalType: "restaurant", category: "Restaurant meal" });
  const retail = product("retail", { category: "Electronics" });

  const ranked = rankSimilarVerticalListings(current, [meal, retail, property]);
  assert.deepEqual(ranked.map((item) => item.id), ["property-match"]);
});
