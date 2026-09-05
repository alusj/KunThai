import assert from "node:assert/strict";
import test from "node:test";

import {
  hasBusinessPlans,
  isProductBusinessKind,
  supportsMarketplaceFulfillment,
  usesMarketplaceCategories,
} from "./marketplaceBusinessKinds.js";

test("vendor uses the shared product catalog, categories, and fulfillment", () => {
  assert.equal(isProductBusinessKind("vendor"), true);
  assert.equal(usesMarketplaceCategories("vendor"), true);
  assert.equal(supportsMarketplaceFulfillment("vendor"), true);
});

test("existing business-kind behavior remains unchanged", () => {
  assert.equal(isProductBusinessKind("retail"), true);
  assert.equal(isProductBusinessKind("restaurant"), false);
  assert.equal(supportsMarketplaceFulfillment("restaurant"), true);
  assert.equal(usesMarketplaceCategories("property_agent"), false);
});

test("plans remain available to existing businesses but are deferred for vendors", () => {
  assert.equal(hasBusinessPlans("retail"), true);
  assert.equal(hasBusinessPlans("restaurant"), true);
  assert.equal(hasBusinessPlans("vendor"), false);
});
