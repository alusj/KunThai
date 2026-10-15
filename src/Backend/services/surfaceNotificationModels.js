const SURFACE_SECTORS = {
  explore: new Set(["explore", "platform", "all"]),
  marketplace: new Set(["marketplace"]),
  transport: new Set(["transport"]),
};

function normalizedSector(item = {}) {
  return String(item.sector || item.workspace || "platform").trim().toLowerCase();
}

// Fleet HQ's own rows (rental updates for the company owner and admins). They
// show in the company dashboard notifications, never in a passenger bell.
export const COMPANY_NOTIFICATION_WORKSPACE = "transport_company";

export function isCompanyWorkspaceNotification(item = {}) {
  return String(item.workspace || "").trim().toLowerCase() === COMPANY_NOTIFICATION_WORKSPACE;
}

// Seller and operator dashboard rows (e.g. verification decisions). They show
// in that dashboard's notifications, never in the buyer or passenger bell.
export const DASHBOARD_NOTIFICATION_WORKSPACES = Object.freeze({
  "urmall.seller": "marketplace_seller",
  "urride.operator": "transport_operator",
});

export function notificationWorkspace(item = {}) {
  return String(item.workspace || "").trim().toLowerCase();
}

export function isDashboardWorkspaceNotification(item = {}) {
  return Object.values(DASHBOARD_NOTIFICATION_WORKSPACES).includes(notificationWorkspace(item));
}

export function notificationBelongsToSurface(item, surface) {
  if (isCompanyWorkspaceNotification(item) || isDashboardWorkspaceNotification(item)) return false;
  return Boolean(SURFACE_SECTORS[surface]?.has(normalizedSector(item)));
}

export function surfaceSectors(surface) {
  return [...(SURFACE_SECTORS[surface] || [])];
}

export function isLegacyMisroutedExploreNotification(item = {}) {
  if (item._notification_source === "platform" || Object.prototype.hasOwnProperty.call(item, "notification_type")) {
    return false;
  }

  const content = `${item.actor_name || ""} ${item.message || ""}`.toLowerCase();
  return item.type === "system" && (content.includes("urmall") || content.includes("store admin"));
}

export function mapSurfacePlatformNotification(row = {}) {
  const sector = normalizedSector(row);
  const read = row.status === "read" || row.status === "archived";
  return {
    ...row,
    id: `platform:${row.id}`,
    rawId: row.id,
    platformNotificationId: row.id,
    source: sector === "platform" || sector === "all" ? "system" : sector,
    sourceTable: "platform_notifications",
    type: row.notification_type || "platform_update",
    category: row.category || "system",
    title: row.title || "KunThai update",
    body: row.body || "Open KunThai for the latest information.",
    actionTarget: row.action_target || "",
    actionData: row.action_data || {},
    displayConfig: row.display_config || {},
    media: row.display_config?.media || null,
    createdAt: row.created_at || "",
    created_at: row.created_at || "",
    read,
    unread: !read,
    actionLabel: row.action_data?.actionLabel || row.display_config?.action?.label || "Open",
    canDismiss: row.display_config?.behaviour?.canDismiss !== false,
  };
}
