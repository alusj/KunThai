// Which dashboard a KunThai notification belongs to.
//
// Seller, operator and company notices are platform_notifications rows tagged
// with a dashboard workspace; the UrMall seller dashboard, the UrRide operator
// dashboard and Fleet HQ list them, and the buyer bell, the passenger bell
// and the Explore centre leave them out. The database applies these rules as
// rows are written (supabase/migrations/20261028120000_dashboard_notification_routing.sql);
// this module is the same rules in JavaScript, for tests and for the app.

export const SELLER_WORKSPACE = "marketplace_seller";
export const OPERATOR_WORKSPACE = "transport_operator";
export const COMPANY_WORKSPACE = "transport_company";

export const DASHBOARD_WORKSPACE_SECTOR = Object.freeze({
  [SELLER_WORKSPACE]: "marketplace",
  [OPERATOR_WORKSPACE]: "transport",
  [COMPANY_WORKSPACE]: "transport",
});

// Verification case resource → dashboard. Company and fleet cases name their
// company (resource_id, or the fleet's company_id).
export const CASE_RESOURCE_WORKSPACE = Object.freeze({
  marketplace_business_registration: SELLER_WORKSPACE,
  marketplace_verification: SELLER_WORKSPACE,
  marketplace_business_document: SELLER_WORKSPACE,
  transport_operator_verification: OPERATOR_WORKSPACE,
  transport_document_verification: OPERATOR_WORKSPACE,
  transport_solo_fleet_verification: OPERATOR_WORKSPACE,
  transport_company_verification: COMPANY_WORKSPACE,
  transport_fleet_verification: COMPANY_WORKSPACE,
});

// Admin case drawer target type (notify owner, enforcement) → dashboard.
export const OWNER_TARGET_WORKSPACE = Object.freeze({
  marketplace_business: SELLER_WORKSPACE,
  transport_operator: OPERATOR_WORKSPACE,
  transport_company: COMPANY_WORKSPACE,
});

// Credit notices stay in the person's own notifications (credits are one
// balance) and are copied into each dashboard they run.
export const CREDIT_NOTIFICATION_TYPES = Object.freeze(["visibility_credit_purchase", "visibility_credit_grant"]);

const DASHBOARD_WORKSPACES = new Set(Object.keys(DASHBOARD_WORKSPACE_SECTOR));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value) {
  return String(value ?? "").trim();
}

export function isDashboardWorkspace(workspace) {
  return DASHBOARD_WORKSPACES.has(text(workspace).toLowerCase());
}

/** A dashboard screen named by an action target, e.g. 'urmall:business' → seller. */
export function dashboardForActionTarget(actionTarget) {
  const value = text(actionTarget);
  if (value === "urmall:business" || value.startsWith("urmall:business-")) return { workspace: SELLER_WORKSPACE };
  if (value === "urride:operator-dashboard") return { workspace: OPERATOR_WORKSPACE };
  if (value === "urride:company-dashboard") return { workspace: COMPANY_WORKSPACE };
  if (value.startsWith("urride:company-dashboard:")) {
    const id = value.slice("urride:company-dashboard:".length);
    return { workspace: COMPANY_WORKSPACE, workspaceId: UUID.test(id) ? id : null };
  }
  return null;
}

/** The admin case id in an 'admin-case:<id>' action target, else null. */
export function adminCaseIdFromTarget(actionTarget) {
  const value = text(actionTarget);
  if (!value.startsWith("admin-case:")) return null;
  const id = value.slice("admin-case:".length);
  return UUID.test(id) ? id : null;
}

function route(workspace, workspaceId, extra = {}) {
  return { workspace, sector: DASHBOARD_WORKSPACE_SECTOR[workspace], workspaceId: workspaceId || null, ...extra };
}

/**
 * Dashboard for a notification row, or null when it stays where it is.
 *
 * context (what the database looks up):
 *   caseResourceType, caseCompanyId – the admin case an 'admin-case:' target names
 *   ownedCompanyId – the recipient's company, when a company notice names none
 */
export function routeDashboardNotification(row = {}, context = {}) {
  if (row.campaign_id || !row.user_id || isDashboardWorkspace(row.workspace)) return null;
  const type = text(row.notification_type);
  if (CREDIT_NOTIFICATION_TYPES.includes(type)) return null;

  const companyId = (id) => id || (UUID.test(text(row.workspace_id)) ? text(row.workspace_id) : null) || context.ownedCompanyId || null;

  // Verification and moderation decisions point at their admin case.
  if (adminCaseIdFromTarget(row.action_target)) {
    const workspace = CASE_RESOURCE_WORKSPACE[text(context.caseResourceType)];
    if (!workspace) return null;
    if (workspace !== COMPANY_WORKSPACE) return route(workspace, row.workspace_id, { actionTarget: null });
    const id = context.caseCompanyId || null;
    return id ? route(workspace, id, { actionTarget: null }) : null;
  }

  // Plan notices: the UrMall business, or the UrRide company (else the operator).
  if (type === "business_subscription") {
    const sector = text(row.sector).toLowerCase();
    if (sector === "marketplace") return route(SELLER_WORKSPACE, row.workspace_id);
    if (sector === "transport") {
      return row.workspace_id ? route(COMPANY_WORKSPACE, row.workspace_id) : route(OPERATOR_WORKSPACE, null);
    }
    return null;
  }

  // Anything that opens a seller, operator or company dashboard belongs there.
  const screen = dashboardForActionTarget(row.action_target);
  if (!screen) return null;
  if (screen.workspace !== COMPANY_WORKSPACE) return route(screen.workspace, row.workspace_id);
  const id = companyId(screen.workspaceId);
  return id ? route(COMPANY_WORKSPACE, id) : null;
}

/**
 * The dashboard copies of a credit notice.
 *
 * context: hasSellerBusiness, isOperator, companyIds (companies the person
 * owns), spacePurchase (credits went to an Explore Space, not their balance).
 */
export function creditNoticeDashboardCopies(row = {}, context = {}) {
  if (row.campaign_id || !row.user_id || isDashboardCopy(row) || isDashboardWorkspace(row.workspace)) return [];
  if (!CREDIT_NOTIFICATION_TYPES.includes(text(row.notification_type)) || context.spacePurchase) return [];
  const copies = [];
  if (context.hasSellerBusiness) copies.push(route(SELLER_WORKSPACE, null));
  if (context.isOperator) copies.push(route(OPERATOR_WORKSPACE, null));
  for (const id of new Set(context.companyIds || [])) copies.push(route(COMPANY_WORKSPACE, id));
  return copies;
}

/** A dashboard copy of a notice that is also in the person's own notifications. */
export function isDashboardCopy(row = {}) {
  const config = row.display_config || row.displayConfig || {};
  return Boolean(config && typeof config === "object" && config.dashboardCopyOf);
}

/** Workspace for a notice the admin team sends an owner from the case drawer. */
export function ownerNoticeWorkspace(targetType, targetId = null) {
  const workspace = OWNER_TARGET_WORKSPACE[text(targetType)];
  if (!workspace) return null;
  return route(workspace, workspace === COMPANY_WORKSPACE ? targetId : null);
}
