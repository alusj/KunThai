import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const activationSql = readFileSync(
  new URL("../../../supabase/migrations/20260827200000_business_subscription_activation_and_scheduler.sql", import.meta.url),
  "utf8",
);
const deploymentGuide = readFileSync(
  new URL("../../../supabase/BUSINESS_SUBSCRIPTIONS_DEPLOYMENT.md", import.meta.url),
  "utf8",
);

test("every UrMall business and UrRide company receives an explicit Free baseline", () => {
  assert.match(activationSql, /kunthai_marketplace_business_free_subscription/);
  assert.match(activationSql, /kunthai_transport_company_free_subscription/);
  assert.match(activationSql, /select 'urmall', business\.id, 'free'/);
  assert.match(activationSql, /select 'urride', company\.id, 'free'/);
});

test("subscription reminders use yearly prices and warn about an exact credit shortfall", () => {
  assert.match(activationSql, /v_subscription\.pending_billing_interval/);
  assert.match(activationSql, /v_target_plan\.yearly_credit_cost/);
  assert.match(activationSql, /v_shortfall := greatest\(0, v_cost - coalesce\(v_wallet_balance, 0\)\)/);
  assert.match(activationSql, /Add at least %s more credits to avoid the grace period/);
});

test("plan lifecycle events create durable unified notifications without risking payment rollback", () => {
  assert.match(activationSql, /insert into public\.platform_notifications/);
  assert.match(activationSql, /'business_subscription'/);
  assert.match(activationSql, /category, workspace, workspace_id/);
  assert.match(activationSql, /A notification must never make a successful plan transaction fail/);
  assert.match(activationSql, /kunthai_notify_business_subscription_event/);
});

test("business renewals are scheduled hourly and remain service-role protected", () => {
  assert.match(activationSql, /create extension if not exists pg_cron/);
  assert.match(activationSql, /'kunthai-business-subscription-renewals'/);
  assert.match(activationSql, /'0 \* \* \* \*'/);
  assert.match(activationSql, /grant execute on function public\.process_kunthai_business_subscriptions\(\) to service_role/);
});

test("deployment guide includes yearly billing and lifecycle activation in order", () => {
  const yearly = deploymentGuide.indexOf("20260822090000_business_subscription_yearly_billing.sql");
  const unifiedNotifications = deploymentGuide.indexOf("20260827120000_unified_notifications_admin_supervision.sql");
  const activation = deploymentGuide.indexOf("20260827200000_business_subscription_activation_and_scheduler.sql");
  assert.ok(yearly > -1);
  assert.ok(unifiedNotifications > yearly);
  assert.ok(activation > unifiedNotifications);
});
