// Central place that turns a business's role + admin responsibilities into the
// concrete things a person may do inside that seller workspace.
//
// Owners always have everything. Invited admins only get what the owner turned
// on for them (see ADMIN_RESPONSIBILITIES in businessAdminService):
//   - addProducts     → create/edit listings and browse the store catalog
//   - messageReplies  → open and reply to buyer messages
//   - dashboardAccess → see orders, sales, activity, and the Seller Board
//   - editBusiness    → edit the public profile, locations, categories, and hours
//
// Sensitive store management (payouts, admins, deletion) stays owner-only.
// Every account may create its own business, and owners may explicitly delegate
// profile editing or plans/capacity.

export function getBusinessPermissions(business) {
  const role = business?.role || "owner";
  const isAdmin = role === "admin";
  const responsibilities = business?.adminResponsibilities || {};

  const canAddProducts = !isAdmin || Boolean(responsibilities.addProducts);
  const canReplyMessages = !isAdmin || Boolean(responsibilities.messageReplies);
  const canAccessDashboard = !isAdmin || Boolean(responsibilities.dashboardAccess);
  const canEditBusiness = !isAdmin || Boolean(responsibilities.editBusiness);
  const canManagePlans = !isAdmin || Boolean(responsibilities.manageBilling);

  return {
    role,
    isOwner: !isAdmin,
    isAdmin,
    canAddProducts,
    canReplyMessages,
    canAccessDashboard,
    canEditBusiness,
    // Owner-only store administration.
    canManageBusiness: !isAdmin,
    canManagePlans,
    // Whether this admin has at least one responsibility to act on.
    hasAnyAccess: !isAdmin || canAddProducts || canReplyMessages || canAccessDashboard || canEditBusiness || canManagePlans,
  };
}

// The landing workspace stays focused on listings. Dashboard intelligence,
// sales, and promotions live behind the profile action menu instead of adding
// more tabs to the seller's primary workspace.
export function getAllowedWorkspaceTabs(permissions) {
  const tabs = [];
  if (permissions.canAddProducts) tabs.push("store", "catalog", "drafts");
  return tabs;
}
