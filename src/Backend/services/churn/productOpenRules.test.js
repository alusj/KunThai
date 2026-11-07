import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CHURN_OPEN_PRODUCTS,
  productForMainPage,
  productOpenStorageKey,
  shouldRecordProductOpen,
  utcDayKey,
} from "./productOpenRules.js";

const migration = readFileSync(
  new URL("../../../../supabase/migrations/20261106131000_churn_activity_layer.sql", import.meta.url),
  "utf8",
);

test("main pages map to the right sector", () => {
  assert.equal(productForMainPage("explore"), "explore");
  assert.equal(productForMainPage("marketplace"), "urmall_buyer");
  assert.equal(productForMainPage("marketplace", "business"), "urmall_seller");
  assert.equal(productForMainPage("marketplace", "buyer-screen"), "urmall_buyer");
  assert.equal(productForMainPage("transport"), "urride_passenger");
  assert.equal(productForMainPage("settings"), "");
  assert.equal(productForMainPage(""), "");
});

test("an open is recorded once per UTC day per sector", () => {
  const base = { userId: "u1", product: "swip", today: "2026-11-06" };
  assert.equal(shouldRecordProductOpen({ ...base, lastRecordedDay: "" }), true);
  assert.equal(shouldRecordProductOpen({ ...base, lastRecordedDay: "2026-11-05" }), true);
  assert.equal(shouldRecordProductOpen({ ...base, lastRecordedDay: "2026-11-06" }), false);
});

test("no user or an unknown sector records nothing", () => {
  assert.equal(shouldRecordProductOpen({ userId: "", product: "explore", lastRecordedDay: "", today: "2026-11-06" }), false);
  assert.equal(shouldRecordProductOpen({ userId: "u1", product: "credits", lastRecordedDay: "", today: "2026-11-06" }), false);
});

test("days are UTC and keys are per user and sector", () => {
  assert.equal(utcDayKey(new Date("2026-11-06T23:59:59-05:00")), "2026-11-07");
  assert.notEqual(productOpenStorageKey("u1", "explore"), productOpenStorageKey("u2", "explore"));
  assert.notEqual(productOpenStorageKey("u1", "explore"), productOpenStorageKey("u1", "swip"));
});

test("every client sector is seeded as an open-tracked product in the migration", () => {
  for (const product of CHURN_OPEN_PRODUCTS) {
    assert.match(migration, new RegExp(`\\('${product}',[^\\n]*, true,`), product);
  }
  assert.match(migration, /\('business_plan',[^\n]*, false,/);
  assert.match(migration, /\('credits',[^\n]*, false,/);
});

test("the migration keeps churn tables away from clients", () => {
  assert.match(migration, /revoke all on public\.churn_product_settings, public\.churn_activity_daily, public\.churn_spend_daily\s+from public, anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.churn_refresh_activity\(date, date\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.touch_product_open\(text\) to authenticated/);
  assert.doesNotMatch(migration, /grant (select|insert|update|delete)[^;]*churn_/i);
});
