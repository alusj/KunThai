import assert from "node:assert/strict";
import test from "node:test";

import { getPromotedProductsPerSlide, groupPromotedProducts } from "./promotedCarouselLayout.js";

test("sponsored carousel uses one full product through ten active promotions", () => {
  assert.equal(getPromotedProductsPerSlide(1), 1);
  assert.equal(getPromotedProductsPerSlide(5), 1);
  assert.equal(getPromotedProductsPerSlide(10), 1);
});

test("sponsored carousel groups two products from eleven through twenty-four", () => {
  assert.equal(getPromotedProductsPerSlide(11), 2);
  assert.equal(getPromotedProductsPerSlide(24), 2);
  assert.equal(groupPromotedProducts(Array.from({ length: 11 }, (_, index) => index)).slides.length, 6);
});

test("sponsored carousel groups three products from twenty-five onward", () => {
  assert.equal(getPromotedProductsPerSlide(25), 3);
  const layout = groupPromotedProducts(Array.from({ length: 25 }, (_, index) => index));
  assert.equal(layout.perSlide, 3);
  assert.equal(layout.slides.length, 9);
  assert.equal(layout.slides.at(-1).length, 3);
  assert.deepEqual(layout.slides.at(-1), [24, 0, 1]);
});
