// Central place that turns a business's role + admin responsibilities into the
// concrete things a person may do inside that seller workspace.
//
// Owners always have everything. Invited admins only get what the owner turned
// on for them (see ADMIN_RESPONSIBILITIES in businessAdminService):
//   - addProducts     → create/edit listings and browse the store catalog
//   - messageReplies  → open and reply to buyer messages
//   - dashboardAccess → see orders, sales, activity, and the Seller Board
//
// Store-level management (settings, payouts, admins, deletion, adding another
// business) stays owner-only regardless of responsibilities.

export function getBusinessPermissions(business) {
  const role = business?.role || "owner";
  const isAdmin = role === "admin";
  const responsibilities = business?.adminResponsibilities || {};

  const canAddProducts = !isAdmin || Boolean(responsibilities.addProducts);
  const canReplyMessages = !isAdmin || Boolean(responsibilities.messageReplies);
  const canAccessDashboard = !isAdmin || Boolean(responsibilities.dashboardAccess);

  return {
    role,
    isOwner: !isAdmin,
    isAdmin,
    canAddProducts,
    canReplyMessages,
    canAccessDashboard,
    // Owner-only store administration.
    canManageBusiness: !isAdmin,
    // Whether this admin has at least one responsibility to act on.
    hasAnyAccess: !isAdmin || canAddProducts || canReplyMessages || canAccessDashboard,
  };
}

// The workspace tabs an owner/admin may see, given their permissions. Order is
// preserved so the first entry can be used as a safe default tab.
export function getAllowedWorkspaceTabs(permissions) {
  const tabs = [];
  if (permissions.canAccessDashboard) tabs.push("overview", "sales");
  if (permissions.canAddProducts) tabs.push("store", "catalog", "drafts");
  return tabs;
}
