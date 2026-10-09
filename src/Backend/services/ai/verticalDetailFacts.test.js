import assert from "node:assert/strict";
import test from "node:test";

import { describeListingForAi, verticalDetailFactsForAi } from "./urmallAiModels.js";

const MEAL = {
  id: "m1",
  isVertical: true,
  verticalType: "restaurant",
  name: "Jollof rice with chicken",
  price: 85,
  currency: "SLE",
  description: "Smoky party jollof with grilled chicken.",
  deliveryAvailable: true,
  pickupAvailable: false,
  seller: { name: "Mama Ade Kitchen", city: "Freetown", phone: "+23276000000", verificationStatus: "verified" },
  listingFacts: { mealPeriod: "all_day", preparationMinutes: 25, servedDays: [1, 3, 5] },
};

const PROPERTY = {
  id: "p9",
  isVertical: true,
  verticalType: "property",
  name: "2-bedroom flat in Wilberforce",
  price: 3000,
  currency: "SLE",
  allowNegotiation: true,
  description: "Tiled, fenced, constant water.",
  seller: { name: "Prime Homes", city: "Freetown", email: "agent@example.com" },
  listingFacts: {
    propertyType: "apartment",
    purpose: "rent",
    rentPeriod: "month",
    bedrooms: 2,
    bathrooms: 1,
    furnished: false,
    address: "Wilberforce",
    city: "Freetown",
  },
};

test("a meal detail gives KAI restaurant, price, days, pickup/delivery and description", () => {
  const facts = verticalDetailFactsForAi(MEAL);
  assert.equal(facts.listingKind, "restaurant meal");
  assert.equal(facts.restaurant, "Mama Ade Kitchen");
  assert.equal(facts.seller, undefined);
  assert.match(facts.priceLabel, /85/);
  assert.equal(facts.daysAvailable, "Monday, Wednesday, Friday");
  assert.equal(facts.mealPeriod, "all day");
  assert.equal(facts.preparationMinutesStatedBySeller, 25);
  assert.equal(facts.delivery, true);
  assert.equal(facts.pickup, false);
  assert.equal(facts.description, "Smoky party jollof with grilled chicken.");
  assert.ok(!JSON.stringify(facts).includes("+232"), "no seller phone");
  const everyDay = verticalDetailFactsForAi({ ...MEAL, listingFacts: { servedDays: [0, 1, 2, 3, 4, 5, 6] } });
  assert.equal(everyDay.daysAvailable, "every day");
});

test("the screen text the floating KAI reads carries the same facts, without ids", () => {
  const text = describeListingForAi(verticalDetailFactsForAi(MEAL));
  assert.match(text, /^Listing open on screen/);
  assert.match(text, /- daysAvailable: Monday, Wednesday, Friday/);
  assert.match(text, /- pickup: no/);
  assert.match(text, /- delivery: yes/);
  assert.ok(!text.includes("m1"));
  assert.equal(describeListingForAi(null), "");
  // Long descriptions never push the facts out of KAI's screen context.
  const long = describeListingForAi(verticalDetailFactsForAi({ ...MEAL, description: "word ".repeat(600) }));
  assert.ok(long.length <= 1_200, String(long.length));
  assert.match(long, /- daysAvailable: /);
  assert.match(long.split("\n").at(-1), /^- description: word/);
});

test("a property gives KAI type, rent or sale with its period, price, location and rooms", () => {
  const facts = verticalDetailFactsForAi(PROPERTY);
  assert.equal(facts.listingKind, "real-estate property");
  assert.equal(facts.agent, "Prime Homes");
  assert.equal(facts.propertyType, "apartment");
  assert.equal(facts.forRentOrSale, "rent");
  assert.match(facts.priceLabel, /3,000.* per month$/);
  assert.equal(facts.bedrooms, 2);
  assert.equal(facts.bathrooms, 1);
  assert.equal(facts.furnished, false);
  assert.equal(facts.location, "Wilberforce, Freetown");
  assert.equal(facts.priceNegotiable, true);
  assert.ok(!JSON.stringify(facts).includes("agent@example.com"));
  const sale = verticalDetailFactsForAi({ ...PROPERTY, listingFacts: { ...PROPERTY.listingFacts, purpose: "sale", rentPeriod: undefined } });
  assert.doesNotMatch(sale.priceLabel, /per/);
});

test("rooms and hotels are priced per night; shop products are not described here", () => {
  const room = verticalDetailFactsForAi({ id: "r1", isVertical: true, verticalType: "room", name: "Deluxe", price: 500, currency: "SLE", seller: { name: "Lumley Inn" }, listingFacts: { capacity: 2, roomsAvailable: 3, amenities: ["Wi-Fi", "AC"] } });
  assert.match(room.priceLabel, /per night$/);
  assert.equal(room.hotel, "Lumley Inn");
  assert.equal(room.amenities, "Wi-Fi, AC");
  assert.equal(verticalDetailFactsForAi({ id: "x", name: "Phone" }), null);
});
