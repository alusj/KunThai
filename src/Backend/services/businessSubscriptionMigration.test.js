import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaSql = readFileSync(
  new URL("../../../supabase/migrations/20260820130000_visibility_credit_business_subscriptions.sql", import.meta.url),
  "utf8",
);
const guardSql = readFileSync(
  new URL("../../../supabase/migrations/20260820140000_business_subscription_capacity_guards.sql", import.meta.url),
  "utf8",
);
const renewalSql = readFileSync(
  new URL("../../../supabase/migrations/20260820150000_business_subscription_renewals.sql", import.meta.url),
  "utf8",
);

test("business plans keep the approved Visibility Credit prices and limits", () => {
  assert.match(schemaSql, /'urmall', 'free'.*?10, null, null, 0/s);
  assert.match(schemaSql, /'urmall', 'pro'.*?30, 30, 7, 50, null, null, 1/s);
  assert.match(schemaSql, /'urmall', 'premium'.*?75, 30, 7, null, null, null, 5/s);
  assert.match(schemaSql, /'urride', 'free'.*?null, 5, 5, 0/s);
  assert.match(schemaSql, /'urride', 'pro'.*?40, 30, 7, null, 15, 15, 1/s);
  assert.match(schemaSql, /'urride', 'premium'.*?100, 30, 7, null, 50, 50, 5/s);
});

test("all capacity-consuming resources have authoritative database guards", () => {
  for (const trigger of [
    "kunthai_guard_urmall_product_capacity",
    "kunthai_guard_urmall_admin_capacity",
    "kunthai_guard_urride_vehicle_capacity",
    "kunthai_guard_urride_invite_capacity",
    "kunthai_guard_urride_member_capacity",
  ]) {
    assert.match(guardSql, new RegExp(`create trigger ${trigger}`));
  }
  assert.match(guardSql, /KUNTHAI_PLAN_LIMIT/);
});

test("renewals use reminders, an atomic credit debit, and a grace state", () => {
  assert.match(renewalSql, /kunthai_send_subscription_reminders/);
  assert.match(renewalSql, /kunthai_debit_subscription_credits/);
  assert.match(renewalSql, /set status = 'grace'/);
  assert.match(renewalSql, /Existing resources were preserved/);
  assert.match(schemaSql, /subscription_spend/);
});

