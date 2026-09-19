import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { upgradeNearbyAdvertDraft } from "./advertDraft.js";

// "Nearby Reach" used to match a free-text area against location fields that
// nothing writes, so those adverts spent credits and reached nobody. Nearby is
// now resolved to states/districts on the server and retired in the composer.

const migration = readFileSync(
  new URL("../../../../supabase/migrations/20260919130000_explore_nearby_adverts_use_regions.sql", import.meta.url),
  "utf8",
);
const composer = readFileSync(
  new URL("../../../components/Explore/ExploreTabs/urfeed/feed/composer/AdvertComposerFields.jsx", import.meta.url),
  "utf8",
);

test("an old nearby draft becomes a state/district choice", () => {
  const upgraded = upgradeNearbyAdvertDraft({ audienceType: "nearby", targetArea: "Freetown", placement: "urfeed" });
  assert.equal(upgraded.audienceType, "recommended");
  assert.equal(upgraded.targetArea, "");
  assert.equal(upgraded.regionMode, "regions");
  assert.deepEqual(upgraded.targetRegions, []);
  assert.equal(upgraded.placement, "urfeed");
  const regional = { audienceType: "everyone", regionMode: "regions", targetRegions: [{ id: "a", name: "Kambia" }] };
  assert.equal(upgradeNearbyAdvertDraft(regional), regional);
});

test("the composer no longer offers Nearby Reach or a free-text area", () => {
  assert.match(composer, /SELECTABLE_AUDIENCES = AUDIENCES\.filter\(\(audience\) => audience\.value !== "nearby"\)/);
  assert.match(composer, /<ChoiceGrid options=\{SELECTABLE_AUDIENCES\}/);
  assert.doesNotMatch(composer, /onChange\("targetArea"/);
});

test("nearby delivery uses resolved regions, never the unwritten coarse fields", () => {
  const delivery = migration.slice(migration.search(/CREATE OR REPLACE FUNCTION public\.get_recommended_explore_ads/i));
  assert.doesNotMatch(delivery, /coarse_city|coarse_area/);
  assert.match(delivery, /ad\.audience_type = 'nearby' and coalesce\(cardinality\(ad\.target_region_ids\), 0\) > 0/);
  assert.match(delivery, /kunthai_account_in_regions\(p_user_id, ad\.target_region_ids\)/);
});

test("an area nobody can be matched to is refused before credits are spent", () => {
  assert.match(migration, /before insert or update of audience_type, target_area, target_region_ids on public\.explore_ad_campaigns/);
  assert.match(migration, /tg_op = 'INSERT' or new\.target_area is distinct from old\.target_area/);
  assert.match(migration, /raise exception 'Choose the nearby area as a state or district/);
  assert.match(migration, /revoke all on function public\.explore_ad_nearby_region_ids\(uuid, text\) from public, anon, authenticated;/);
});
