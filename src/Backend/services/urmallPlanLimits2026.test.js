import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

// UrMall plans from 2026-10-10: Free 5 (and meals on up to 5 weekdays),
// Pro 30 at the same price, Premium unlimited at 100 / 1000 credits.

const WEB = fileURLToPath(new URL("../../../", import.meta.url));
const migration = readFileSync(new URL("../../../supabase/migrations/20261010100000_urmall_plan_limits_2026.sql", import.meta.url), "utf8");

// Bundle the browser modules with the Supabase client stubbed out.
async function load(entry) {
  const bundle = await build({
    stdin: { contents: entry, resolveDir: WEB },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    plugins: [{
      name: "stub-supabase",
      setup(builder) {
        builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: "supabase", namespace: "stub" }));
        builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {};" }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
}

const service = await load('export * from "./src/Backend/services/businessSubscriptionService.js";');
const features = await load('export { planFeatureKey, translatePlanFeature } from "./src/components/shared/planFeatureText.js";');

test("the fallback catalogue matches the new UrMall plans and leaves UrRide alone", () => {
  const [free, pro, premium] = service.getFallbackBusinessPlans("urmall");
  assert.deepEqual([free.productLimit, pro.productLimit, premium.productLimit], [5, 30, null]);
  assert.deepEqual([free.mealDayLimit, pro.mealDayLimit, premium.mealDayLimit], [5, null, null]);
  assert.deepEqual([pro.creditCost, pro.yearlyCreditCost], [30, 300]);
  assert.deepEqual([premium.creditCost, premium.yearlyCreditCost], [100, 1000]);
  assert.deepEqual([free.adminLimit, pro.adminLimit, premium.adminLimit], [0, 1, 5]);
  const urride = service.getFallbackBusinessPlans("urride");
  assert.deepEqual(urride.map((plan) => [plan.creditCost, plan.operatorLimit, plan.vehicleLimit]), [[0, 5, 5], [40, 15, 15], [100, 50, 50]]);
});

test("the fallback catalogue and the migration describe the plans with the same words", () => {
  for (const plan of service.getFallbackBusinessPlans("urmall")) {
    assert.ok(migration.includes(JSON.stringify(plan.features)), `${plan.planCode} features match the database`);
  }
  assert.match(migration, /set product_limit = 5,\s+meal_day_limit = 5,/);
  assert.match(migration, /set product_limit = 30,\s+meal_day_limit = null,/);
  assert.match(migration, /credit_cost = 100,\s+yearly_credit_cost = 1000,/);
  assert.doesNotMatch(migration, /where surface = 'urride'/);
});

test("the restaurant meal-day limit follows the plan in force", () => {
  const plans = [
    { surface: "urmall", plan_code: "free", product_limit: 5, meal_day_limit: 5, sort_order: 1 },
    { surface: "urmall", plan_code: "pro", product_limit: 30, meal_day_limit: null, sort_order: 2 },
  ];
  const free = service.normalizeBusinessSubscriptionState({ plans, subscription: { plan_code: "free" }, entitlement: { plan_code: "free" } });
  assert.equal(service.getMealDayLimit(free), 5);
  const pro = service.normalizeBusinessSubscriptionState({ plans, subscription: { plan_code: "pro" }, entitlement: { plan_code: "pro" } });
  assert.equal(service.getMealDayLimit(pro), null);
  // An expired Pro is entitled to Free.
  const expired = service.normalizeBusinessSubscriptionState({ plans, subscription: { plan_code: "pro" }, entitlement: { plan_code: "free", status: "expired" } });
  assert.equal(service.getMealDayLimit(expired), 5);
  // Before the migration (no meal_day_limit) or without the plan service, never invent a limit.
  const legacy = service.normalizeBusinessSubscriptionState({ plans: [{ surface: "urmall", plan_code: "free", product_limit: 10 }], entitlement: { plan_code: "free" } });
  assert.equal(service.getMealDayLimit(legacy), null);
  assert.equal(service.getMealDayLimit({ ...free, available: false }), null);
});

test("the database's meal-day refusal becomes a plan limit error", () => {
  const error = service.parseBusinessPlanError({ message: "KUNTHAI_PLAN_LIMIT|urmall|meal_days|6|5|free" });
  assert.equal(error.code, "KUNTHAI_PLAN_LIMIT");
  assert.deepEqual([error.resource, error.current, error.limit, error.planCode], ["meal_days", 6, 5, "free"]);
  assert.match(error.message, /allows 5 meal days a week/);
});

test("a Free seller above the new limit is told to upgrade to Pro, and Pro to Premium", () => {
  const state = service.normalizeBusinessSubscriptionState({
    plans: service.getFallbackBusinessPlans("urmall").map((plan) => ({ ...plan })),
    entitlement: { plan_code: "free", product_limit: 5 },
    usage: { products: 8 },
  });
  assert.equal(service.getCapacityStatus(state, "products", 1).allowed, false);
  assert.equal(service.getCapacityUpgradePlan(state, "products", 1).planCode, "pro");
  const full = { ...state, usage: { products: 30 }, entitlement: { ...state.entitlement, planCode: "pro", productLimit: 30 } };
  assert.equal(service.getCapacityUpgradePlan(full, "products", 1).planCode, "premium");
});

test("every UrMall plan line shown to sellers has a translation", () => {
  for (const plan of service.getFallbackBusinessPlans("urmall")) {
    const normalized = service.normalizeBusinessSubscriptionState({ plans: [plan] }).plans[0];
    for (const feature of normalized.features) {
      assert.ok(features.planFeatureKey(feature), `"${feature}" has a translation key`);
      assert.equal(features.translatePlanFeature(feature), feature, `English shows "${feature}"`);
    }
  }
});
