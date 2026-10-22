import assert from "node:assert/strict";
import test from "node:test";

import { getPromotedProductsPerSlide, groupPromotedProducts } from "./promotedCarouselLayout.js";

test("sponsored carousel shows one full product per slide up to eight promotions", () => {
  assert.equal(getPromotedProductsPerSlide(0), 1);
  assert.equal(getPromotedProductsPerSlide(1), 1);
  assert.equal(getPromotedProductsPerSlide(8), 1);
  assert.equal(groupPromotedProducts(Array.from({ length: 8 }, (_, index) => index)).slides.length, 8);
});

test("more than eight promotions: two products per slide, through seventeen", () => {
  assert.equal(getPromotedProductsPerSlide(9), 2);
  assert.equal(getPromotedProductsPerSlide(17), 2);
  const layout = groupPromotedProducts(Array.from({ length: 9 }, (_, index) => index));
  assert.equal(layout.perSlide, 2);
  assert.equal(layout.slides.length, 5);
  // The last slide is topped up from the start so it is never half empty.
  assert.deepEqual(layout.slides.at(-1), [8, 0]);
});

test("eighteen or more promotions: three products per slide", () => {
  assert.equal(getPromotedProductsPerSlide(18), 3);
  assert.equal(getPromotedProductsPerSlide(60), 3);
  const layout = groupPromotedProducts(Array.from({ length: 19 }, (_, index) => index));
  assert.equal(layout.perSlide, 3);
  assert.equal(layout.slides.length, 7);
  assert.deepEqual(layout.slides.at(-1), [18, 0, 1]);
});
