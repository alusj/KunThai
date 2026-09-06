import assert from "node:assert/strict";
import test from "node:test";

import { buildPublicCompanyTabs } from "./publicTransportCompanyProfilePolicy.js";

test("company profile exposes only fleet categories the company actually has", () => {
  const tabs = buildPublicCompanyTabs({
    fleets: [
      { fleetType: "Motorbike" },
      { fleetType: "Taxi" },
      { fleetType: "Motorbike" },
    ],
    rentals: [],
  });

  assert.deepEqual(tabs.map((tab) => tab.label), ["Motorbike", "Taxi", "Reviews", "About"]);
  assert.equal(tabs.some((tab) => tab.label === "Tricycle"), false);
  assert.equal(tabs.some((tab) => tab.label === "Rentals"), false);
});

test("rentals appears once when the company has public rental inventory", () => {
  const tabs = buildPublicCompanyTabs({
    fleets: [{ fleetType: "Tricycle" }],
    rentals: [{ id: "rental-1" }, { id: "rental-2" }],
  });

  assert.deepEqual(tabs.map((tab) => tab.id), ["fleet:tricycle", "rentals", "reviews", "about"]);
});

test("an inventory-free profile still exposes reviews and company information", () => {
  assert.deepEqual(buildPublicCompanyTabs({ fleets: [], rentals: [] }), [
    { id: "reviews", label: "Reviews", kind: "reviews" },
    { id: "about", label: "About", kind: "about" },
  ]);
});
