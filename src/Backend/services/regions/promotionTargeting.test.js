import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  checkPromotionTargeting,
  creditsForAreas,
  creditsForCountries,
  maxTargetAreas,
  maxTargetCountries,
  normalizeCountrySelection,
  promotionReachesCountry,
  promotionTargetingMessage,
} from "./promotionTargeting.js";
import { detectDeviceCountryIso, DEFAULT_COUNTRY_ISO } from "../../../data/globalCountryProfiles.js";

const migration = readFileSync(
  new URL("../../../../supabase/migrations/20261002120000_global_country_defaults_and_promotion_targeting.sql", import.meta.url),
  "utf8",
);

test("credits decide how many areas a promotion may target", () => {
  assert.equal(maxTargetAreas(5), 1);
  assert.equal(maxTargetAreas(10), 1);
  assert.equal(maxTargetAreas(11), 2);
  assert.equal(maxTargetAreas(14), 2);
  assert.equal(maxTargetAreas(15), 3);
  assert.equal(maxTargetAreas(20), 4);
  assert.equal(maxTargetAreas(10_000), 30);
  assert.equal(creditsForAreas(1), 0);
  assert.equal(creditsForAreas(2), 11);
  assert.equal(creditsForAreas(3), 15);
});

test("several countries start at 100 credits, one per 50", () => {
  assert.equal(maxTargetCountries(99), 1);
  assert.equal(maxTargetCountries(100), 2);
  assert.equal(maxTargetCountries(149), 2);
  assert.equal(maxTargetCountries(150), 3);
  assert.equal(creditsForCountries(2), 100);
  assert.equal(creditsForCountries(3), 150);
});

test("checks explain what is missing", () => {
  assert.equal(checkPromotionTargeting({ credits: 5, areas: 1 }).ok, true);
  const small = checkPromotionTargeting({ credits: 10, areas: 2 });
  assert.equal(small.ok, false);
  assert.match(promotionTargetingMessage(small), /don't have enough credits to select multiple areas/);
  const mid = checkPromotionTargeting({ credits: 11, areas: 3 });
  assert.equal(mid.needed, 4);
  assert.match(promotionTargetingMessage(mid), /11 credits cover up to 2 areas\. Add 4 more/);
  assert.equal(checkPromotionTargeting({ credits: 99, countries: 2 }).ok, false);
  assert.equal(checkPromotionTargeting({ credits: 100, countries: 2 }).ok, true);
  assert.equal(checkPromotionTargeting({ credits: 150, countries: 2, areas: 1 }).reason, "countriesWithAreas");
});

test("country-targeted boosts reach only their countries; older ones are unchanged", () => {
  assert.deepEqual(normalizeCountrySelection(["sl", "Nigeria", "SL", "", null]), ["SL", "NG"]);
  assert.equal(promotionReachesCountry([], "GH"), true);
  assert.equal(promotionReachesCountry(["SL", "NG"], "NG"), true);
  assert.equal(promotionReachesCountry(["SL"], "GH"), false);
});

test("the database mirrors the same limits and checks them before spending", () => {
  assert.match(migration, /when coalesce\(p_credits, 0\) <= 10 then 1 else least\(30, floor\(p_credits \/ 5\.0\)::integer\)/);
  assert.match(migration, /when coalesce\(p_credits, 0\) < 100 then 1 else floor\(p_credits \/ 50\.0\)::integer/);
  assert.match(migration, /before insert or update of target_region_ids, target_country_isos on public\.explore_ad_campaigns/);
  assert.match(migration, /before insert or update of target_region_ids, target_country_isos on public\.marketplace_promotions/);
  assert.match(migration, /viewer\.viewer_country = any\(ad\.target_country_isos\)/);
});

test("no market is the default: the device time zone, then the international fallback", () => {
  assert.equal(detectDeviceCountryIso("Africa/Lagos"), "NG");
  assert.equal(detectDeviceCountryIso("Africa/Freetown"), "SL");
  assert.equal(detectDeviceCountryIso("Asia/Calcutta"), "IN");
  assert.equal(detectDeviceCountryIso("UTC"), "");
  assert.equal(DEFAULT_COUNTRY_ISO, "US");
  assert.doesNotMatch(migration, /'SLE'\)\s*;/);
  assert.match(migration, /return coalesce\(resolved_currency, 'USD'\);/);
});
