import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getMarketplacePromotionDurationDays } from "../visibilityCreditRules.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../../../../supabase/migrations/20261008120000_urmall_promotion_pricing_fixes.sql");
const planScreen = read("../../../components/shared/BusinessPlanScreen.jsx");
const subscriptionService = read("../businessSubscriptionService.js");

// The SQL twin of the client formula (kunthai_marketplace_promotion_duration_days),
// evaluated here; supabase/tests/urmall_promotion_pricing_fixes.sql runs it in Postgres.
function sqlDurationDays(credits) {
  const amount = credits || 5;
  return Math.round(Math.max(1, Math.min(30, 1 + Math.max(0, amount - 5) * 0.3)) * 10) / 10;
}

test("the database grants the boost duration the seller is shown", () => {
  for (const credits of [5, 6, 10, 15, 20, 37, 100, 500]) {
    assert.equal(sqlDurationDays(credits), getMarketplacePromotionDurationDays(credits), `${credits} credits`);
  }
  assert.match(sql, /1::numeric \+ greatest\(0, coalesce\(nullif\(p_credits, 0\), 5\) - 5\)::numeric \* 0\.3/);
  assert.doesNotMatch(sql, /ceiling\(v_credit_budget::numeric \/ 5\)/);
});

test("delegated admins with product access may boost, paying from their own wallet", () => {
  assert.match(sql, /has_urmall_admin_responsibility\(p\.business_id, 'addProducts'\)/);
  assert.match(sql, /perform public\.spend_visibility_credits\(/);
});

test("re-promoting never rewrites a live boost's targeting", () => {
  assert.match(sql, /if v_existing_id is not null and v_promotion\.id = v_existing_id then/);
});

test("changing plan keeps the current auto-renew choice", () => {
  assert.doesNotMatch(planScreen, /selectedPlan\.planCode, true, selectedInterval/);
  assert.match(planScreen, /planChangeAutoRenew\(state\.subscription\)/);
  assert.match(subscriptionService, /export function planChangeAutoRenew/);
});
