import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CASE_RESOURCE_WORKSPACE,
  OWNER_TARGET_WORKSPACE,
  creditNoticeDashboardCopies,
  dashboardForActionTarget,
  isDashboardCopy,
  ownerNoticeWorkspace,
  routeDashboardNotification,
} from "./notificationDashboardRouting.js";
import { DASHBOARD_NOTIFICATION_WORKSPACES, notificationBelongsToSurface } from "./surfaceNotificationModels.js";

const USER = "11111111-1111-4111-8111-111111111111";
const COMPANY = "22222222-2222-4222-8222-222222222222";
const CASE = "33333333-3333-4333-8333-333333333333";
const migration = readFileSync(
  new URL("../../../supabase/migrations/20261028120000_dashboard_notification_routing.sql", import.meta.url),
  "utf8",
);

const row = (fields) => ({ user_id: USER, sector: "platform", workspace: "platform", ...fields });

test("verification outcomes go to the seller, operator or company dashboard", () => {
  for (const decision of ["verification_approved", "moderation_action", "verification_information_requested", "verification_resubmitted"]) {
    const notice = row({ notification_type: decision, action_target: `admin-case:${CASE}` });
    assert.deepEqual(
      routeDashboardNotification(notice, { caseResourceType: "marketplace_business_registration" }),
      { workspace: "marketplace_seller", sector: "marketplace", workspaceId: null, actionTarget: null },
    );
    assert.equal(routeDashboardNotification(notice, { caseResourceType: "transport_operator_verification" }).workspace, "transport_operator");
    assert.deepEqual(
      routeDashboardNotification(notice, { caseResourceType: "transport_company_verification", caseCompanyId: COMPANY }),
      { workspace: "transport_company", sector: "transport", workspaceId: COMPANY, actionTarget: null },
    );
  }
});

test("company notices need a company; Explore cases stay in general notifications", () => {
  const notice = row({ notification_type: "verification_approved", action_target: `admin-case:${CASE}` });
  assert.equal(routeDashboardNotification(notice, { caseResourceType: "transport_fleet_verification" }), null);
  assert.equal(routeDashboardNotification(notice, { caseResourceType: "explore_comment_report" }), null);
  assert.equal(routeDashboardNotification(row({ action_target: "urride:company-dashboard" })), null);
  assert.equal(
    routeDashboardNotification(row({ action_target: "urride:company-dashboard" }), { ownedCompanyId: COMPANY }).workspaceId,
    COMPANY,
  );
});

test("notices that open a dashboard belong to it", () => {
  assert.equal(dashboardForActionTarget("urmall:business").workspace, "marketplace_seller");
  assert.equal(dashboardForActionTarget("urmall:business-messages").workspace, "marketplace_seller");
  assert.equal(dashboardForActionTarget("urride:operator-dashboard").workspace, "transport_operator");
  assert.deepEqual(dashboardForActionTarget(`urride:company-dashboard:${COMPANY}`), { workspace: "transport_company", workspaceId: COMPANY });
  for (const buyerScreen of ["urmall", "urmall:orders", "urmall:store", "urride", "urride:rental:x", "notifications", ""]) {
    assert.equal(dashboardForActionTarget(buyerScreen), null, buyerScreen);
  }
  const enforcement = row({ sector: "transport", notification_type: "account_enforcement", action_target: "urride:operator-dashboard" });
  assert.equal(routeDashboardNotification(enforcement).workspace, "transport_operator");
});

test("plan notices go to the business or company", () => {
  assert.equal(routeDashboardNotification(row({ notification_type: "business_subscription", sector: "marketplace", action_target: "urmall:business" })).workspace, "marketplace_seller");
  assert.deepEqual(
    routeDashboardNotification(row({ notification_type: "business_subscription", sector: "transport", workspace_id: COMPANY, action_target: "urride:plans" })),
    { workspace: "transport_company", sector: "transport", workspaceId: COMPANY },
  );
  assert.equal(routeDashboardNotification(row({ notification_type: "business_subscription", sector: "transport" })).workspace, "transport_operator");
});

test("campaigns, already-routed rows and credit notices are left alone", () => {
  assert.equal(routeDashboardNotification(row({ campaign_id: "c", action_target: "urmall:business" })), null);
  assert.equal(routeDashboardNotification(row({ workspace: "transport_company", action_target: "urmall:business" })), null);
  assert.equal(routeDashboardNotification(row({ notification_type: "visibility_credit_purchase", action_target: "urmall:business" })), null);
});

test("credit notices are copied into each dashboard the person runs", () => {
  const purchase = row({ notification_type: "visibility_credit_purchase" });
  assert.deepEqual(
    creditNoticeDashboardCopies(purchase, { hasSellerBusiness: true, isOperator: true, companyIds: [COMPANY, COMPANY] }).map((copy) => [copy.workspace, copy.workspaceId]),
    [["marketplace_seller", null], ["transport_operator", null], ["transport_company", COMPANY]],
  );
  assert.deepEqual(creditNoticeDashboardCopies(purchase, {}), []);
  assert.deepEqual(creditNoticeDashboardCopies(purchase, { hasSellerBusiness: true, spacePurchase: true }), []);
  assert.deepEqual(creditNoticeDashboardCopies(row({ notification_type: "visibility_credit_grant" }), { isOperator: true }).length, 1);
  assert.deepEqual(creditNoticeDashboardCopies(row({ notification_type: "admin_message" }), { isOperator: true }), []);
  const copy = { ...purchase, display_config: { dashboardCopyOf: "n1" } };
  assert.equal(isDashboardCopy(copy), true);
  assert.deepEqual(creditNoticeDashboardCopies(copy, { isOperator: true }), [], "a copy is never copied again");
});

test("admin notices to an owner use the target's dashboard", () => {
  assert.deepEqual(ownerNoticeWorkspace("marketplace_business", "b"), { workspace: "marketplace_seller", sector: "marketplace", workspaceId: null });
  assert.deepEqual(ownerNoticeWorkspace("transport_company", COMPANY), { workspace: "transport_company", sector: "transport", workspaceId: COMPANY });
  assert.equal(ownerNoticeWorkspace("explore_user", "u"), null);
});

test("routed rows stay out of the buyer and passenger bells", () => {
  for (const workspace of ["marketplace_seller", "transport_operator", "transport_company"]) {
    for (const surface of ["explore", "marketplace", "transport"]) {
      assert.equal(notificationBelongsToSurface({ sector: workspace === "marketplace_seller" ? "marketplace" : "transport", workspace }, surface), false);
    }
  }
  assert.equal(DASHBOARD_NOTIFICATION_WORKSPACES["urmall.seller"], "marketplace_seller");
  assert.equal(DASHBOARD_NOTIFICATION_WORKSPACES["urride.operator"], "transport_operator");
});

test("the migration applies the same rules", () => {
  for (const [resourceType, workspace] of Object.entries(CASE_RESOURCE_WORKSPACE)) {
    const branch = migration.match(new RegExp(`when admin_case\\.resource_type in \\(([^)]*'${resourceType}'[^)]*)\\)\\s+then '([a-z_]+)'`));
    assert.ok(branch, `${resourceType} is routed`);
    assert.equal(branch[2], workspace, resourceType);
  }
  for (const [targetType, workspace] of Object.entries(OWNER_TARGET_WORKSPACE)) {
    assert.match(migration, new RegExp(`when '${targetType}' then '${workspace}'`), `owner notice for ${targetType}`);
  }
  assert.match(migration, /v_target = 'urmall:business' or v_target like 'urmall:business-%'/);
  assert.match(migration, /v_target = 'urride:operator-dashboard'/);
  assert.match(migration, /v_type in \('visibility_credit_purchase', 'visibility_credit_grant'\)/);
  assert.match(migration, /array\['in_app'\]::text\[\], 'inbox'/, "copies are in-app only");
  assert.match(migration, /\? 'dashboardCopyOf'\s+or 'push' = any/, "copies never get the push channel");
  assert.match(migration, /old\.status <> 'waiting_information'/, "only an applicant's answer sends 'Update received'");
});
