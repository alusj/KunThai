import assert from "node:assert/strict";
import test from "node:test";
import { businessTypeCapacity, highestOwnedBusinessPlan } from "./businessTypePolicy.js";

test("business type capacity progresses from one to two to all four", () => {
  assert.equal(businessTypeCapacity().allowed, true);
  assert.equal(businessTypeCapacity({ usedKinds: ["retail"] }).requiredPlan, "pro");
  assert.equal(businessTypeCapacity({ planCode: "pro", usedKinds: ["retail"] }).allowed, true);
  assert.equal(businessTypeCapacity({ planCode: "pro", usedKinds: ["retail", "vendor"] }).requiredPlan, "premium");
  assert.equal(businessTypeCapacity({ planCode: "premium", usedKinds: ["retail", "vendor", "restaurant"] }).allowed, true);
  const full = businessTypeCapacity({ planCode: "premium", usedKinds: ["retail", "vendor", "restaurant", "property_agent"] });
  assert.equal(full.allowed, false);
  assert.equal(full.requiredPlan, "");
});

test("a legacy hotel counts as the real estate type, not a fifth type", () => {
  const capacity = businessTypeCapacity({ planCode: "pro", usedKinds: ["hotel", "property_agent"] });
  assert.equal(capacity.current, 1);
  assert.equal(capacity.allowed, true);
});

test("only owned active unexpired subscriptions unlock business types", () => {
  const now = Date.parse("2026-09-05T12:00:00Z");
  const business = [{ id: "owned" }, { id: "second" }];
  const plans = [
    { marketplace_business_id: "admin-workspace", plan_code: "premium", status: "active", current_period_end: "2027-01-01" },
    { marketplace_business_id: "owned", plan_code: "premium", status: "active", current_period_end: "2026-09-04" },
    { marketplace_business_id: "owned", plan_code: "premium", status: "grace", current_period_end: "2027-01-01" },
    { marketplace_business_id: "second", plan_code: "pro", status: "active", current_period_end: "2027-01-01" },
  ];
  assert.equal(highestOwnedBusinessPlan(business, plans, now).plan_code, "pro");
  assert.equal(highestOwnedBusinessPlan([], plans, now), null);
});
