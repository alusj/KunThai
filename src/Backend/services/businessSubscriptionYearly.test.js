import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const yearlySql = readFileSync(
  new URL("../../../supabase/migrations/20260822090000_business_subscription_yearly_billing.sql", import.meta.url),
  "utf8",
);

test("yearly migration adds an additive, backward-compatible cadence", () => {
  // New optional catalog + subscription columns default to the monthly world.
  assert.match(yearlySql, /add column if not exists yearly_credit_cost integer/);
  assert.match(yearlySql, /add column if not exists yearly_duration_days integer/);
  assert.match(yearlySql, /add column if not exists billing_interval text not null default 'monthly'/);
  assert.match(yearlySql, /add column if not exists pending_billing_interval text/);
});

test("plan-change RPC stays compatible with four-argument monthly callers", () => {
  // The old signature is dropped and replaced by one whose cadence defaults to
  // monthly, so existing four-argument calls resolve unchanged.
  assert.match(yearlySql, /drop function if exists public\.change_kunthai_business_plan\(text, uuid, text, boolean\)/);
  assert.match(yearlySql, /p_billing_interval text default 'monthly'/);
  assert.match(yearlySql, /grant execute on function public\.change_kunthai_business_plan\(text, uuid, text, boolean, text\) to authenticated/);
});

test("cadence is surfaced to the client and honoured at renewal", () => {
  assert.match(yearlySql, /'billing_interval', coalesce\(v_subscription\.billing_interval, 'monthly'\)/);
  assert.match(yearlySql, /v_renew_cost integer/);
  assert.match(yearlySql, /when v_target_interval = 'yearly'/);
  // Yearly is priced at ten monthly periods (two months free).
  assert.match(yearlySql, /credit_cost \* 10/);
});
