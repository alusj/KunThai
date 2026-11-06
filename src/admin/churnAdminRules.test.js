import test from "node:test";
import assert from "node:assert/strict";

import {
  CHURN_PRODUCTS,
  barWidth,
  countryLabel,
  formatMoneyList,
  formatPercent,
  growthRate,
  hasProvisional,
  personLabel,
  pointChange,
  sameScopes,
  stickiness,
  toggleProductScope,
  visibleChurnTabs,
  weekdayName,
} from "./churnAdminRules.js";

test("tabs follow the admin's churn permissions", () => {
  assert.deepEqual(visibleChurnTabs({}), ["overview", "leaders", "regions", "campaigns"]);
  assert.deepEqual(visibleChurnTabs({ canViewUsers: true }), ["overview", "leaders", "regions", "watchlist", "campaigns"]);
  assert.deepEqual(visibleChurnTabs({ canViewUsers: true, canManageAccess: true }), ["overview", "leaders", "regions", "watchlist", "campaigns", "access"]);
  assert.deepEqual(visibleChurnTabs({ canManageAccess: true }), ["overview", "leaders", "regions", "campaigns", "access"]);
});

test("rates, changes and growth", () => {
  assert.equal(formatPercent(0.1975, "en"), "19.8%");
  assert.equal(formatPercent(null, "en"), "0%");
  assert.equal(pointChange(0.21, 0.198), 1.2);
  assert.equal(pointChange(0.2, null), null);
  assert.equal(growthRate(12, 10), 0.2);
  assert.equal(growthRate(5, 0), null);
  assert.equal(stickiness(3, 12), 0.25);
  assert.equal(stickiness(3, 0), 0);
});

test("money stays in each currency and is never added across currencies", () => {
  const list = formatMoneyList([
    { currency: "SLE", amount: 437.21 },
    { currency: "usd", amount: 12.5 },
    { currency: "XOF", amount: 0 },
    { currency: "", amount: 9 },
  ], "en");
  assert.equal(list.length, 2);
  assert.match(list[0], /SLE|Le/);
  assert.match(list[0], /437/);
  assert.match(list[1], /\$12\.50/);
  assert.deepEqual(formatMoneyList(null), []);
});

test("bars show small values and nothing for zero", () => {
  assert.equal(barWidth(0, 10), 0);
  assert.equal(barWidth(1, 1000), 2);
  assert.equal(barWidth(5, 10), 50);
  assert.equal(barWidth(20, 10), 100);
  assert.equal(barWidth(3, 0), 0);
});

test("weekday names start on Monday", () => {
  assert.equal(weekdayName(1, "en"), "Mon");
  assert.equal(weekdayName(7, "en"), "Sun");
  assert.equal(weekdayName(0, "en"), "");
});

test("product access toggles keep 'all' exclusive and never empty", () => {
  assert.deepEqual(toggleProductScope(["all"], "swip"), ["swip"]);
  assert.deepEqual(toggleProductScope(["swip"], "explore"), ["explore", "swip"]);
  assert.deepEqual(toggleProductScope(["swip"], "swip"), ["all"]);
  assert.deepEqual(toggleProductScope(["swip", "credits"], "all"), ["all"]);
  assert.ok(sameScopes(["swip", "explore"], ["explore", "swip"]));
  assert.ok(!sameScopes(["all"], ["swip"]));
  assert.equal(CHURN_PRODUCTS.length, 8);
});

test("people and countries get readable labels", () => {
  assert.equal(personLabel({ name: "Ama" }), "Ama");
  assert.equal(personLabel({ username: "ama" }), "@ama");
  assert.equal(personLabel({}, "KunThai user"), "KunThai user");
  assert.equal(countryLabel({ iso: "??" }, "No country set"), "No country set");
  assert.equal(countryLabel({ iso: "SL", name: "Sierra Leone" }), "Sierra Leone");
  assert.ok(hasProvisional([{ provisional: false }, { provisional: true }]));
  assert.ok(!hasProvisional([]));
});
