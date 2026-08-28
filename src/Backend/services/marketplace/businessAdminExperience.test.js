import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("the responsibility card stays centered with persistent OK confirmation", () => {
  const source = readSource("../../../components/Marketplace/MarketplaceHeader/Business/BusinessHeader/MyBizMenu/MyBizPages/BusinessAdmins/BusinessAdmins.jsx");
  assert.match(source, /flex items-center justify-center/);
  assert.match(source, /max-h-\[min\(78dvh,680px\)\]/);
  assert.match(source, /aria-pressed=\{active\}/);
  assert.match(source, /: "OK"/);
});

test("admin capacity failures name the selected person and required plan", () => {
  const source = readSource("businessAdminService.js");
  assert.match(source, /we can’t add \$\{name\}/);
  assert.match(source, /getCapacityUpgradePlan\(planState, "admins", 1\)/);
});

test("UrMall never paints a sponsored placeholder without a real promotion", () => {
  const source = readSource("../../../components/Marketplace/Browse/PromotedAdsCarousel.jsx");
  assert.match(source, /if \(!ads\.length\) return null/);
  assert.doesNotMatch(source, /aria-busy="true"/);
  assert.doesNotMatch(source, /MAX_SKELETON_MS/);
});

test("business switching stays visible and persists the selected workspace", () => {
  const switcher = readSource("../../../components/Marketplace/MarketplaceHeader/Business/BusinessHeader/BusinessSwitcher.jsx");
  const dashboard = readSource("../../../components/Marketplace/MarketplaceHeader/Business/Business.jsx");
  const overview = readSource("../../hooks/useSellerOverview.js");
  assert.doesNotMatch(switcher, /businesses\.length < 2/);
  assert.match(dashboard, /readCachedActiveRegisteredBusinessId/);
  assert.match(dashboard, /setSelectedBusinessId\(businessId\)/);
  assert.match(overview, /byBusiness: new Map\(\)/);
});

test("delegated responsibilities are enforced by database policies", () => {
  const migration = readSource("../../../../supabase/migrations/20260828120000_urmall_admin_responsibilities.sql");
  for (const responsibility of ["addProducts", "messageReplies", "dashboardAccess", "editBusiness"]) {
    assert.match(migration, new RegExp(`'${responsibility}'`));
  }
  assert.match(migration, /payouts, verification documents/);
});
