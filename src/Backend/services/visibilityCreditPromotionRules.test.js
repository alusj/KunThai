import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getMarketplacePromotionDurationDays,
  getMinimumExploreAdvertCredits,
  getMonimePaymentInstructions,
} from "./visibilityCreditRules.js";

test("UrMall promotion pricing grows continuously from the five-credit starter", () => {
  assert.equal(getMarketplacePromotionDurationDays(5), 1);
  assert.equal(getMarketplacePromotionDurationDays(10), 2.5);
  assert.equal(getMarketplacePromotionDurationDays(15), 4);
  assert.equal(getMarketplacePromotionDurationDays(20), 5.5);
  assert.equal(getMarketplacePromotionDurationDays(500), 30);
});

test("Explore advert minimums match each placement", () => {
  assert.equal(getMinimumExploreAdvertCredits("urfeed"), 5);
  assert.equal(getMinimumExploreAdvertCredits("swip"), 10);
  assert.equal(getMinimumExploreAdvertCredits("both"), 15);
});

test("Monime payment-code copy never claims a push was sent", () => {
  const instructions = getMonimePaymentInstructions({
    credits: 15,
    phoneNumber: "+23279722036",
    walletName: "Orange Money",
  });
  assert.match(instructions.message, /secured to \+23279722036/i);
  assert.match(instructions.message, /tap dial/i);
  assert.doesNotMatch(instructions.message, /we sent|prompt/i);
});

test("database promotion guards carry the same pricing and placement floors", () => {
  const migration = readFileSync(
    new URL("../../../supabase/migrations/20260828090000_fair_promotion_pricing_and_urfeed_starter.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /credit_amount - 5/);
  assert.match(migration, /\* 0\.3/);
  assert.match(migration, /when 'both' then 15/);
  assert.match(migration, /when 'swip' then 10/);
  assert.match(migration, /else 5/);
});
