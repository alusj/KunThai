const SURFACE_SECTORS = {
  explore: new Set(["explore", "platform", "all"]),
  marketplace: new Set(["marketplace"]),
  transport: new Set(["transport"]),
};

function normalizedSector(item = {}) {
  return String(item.sector || item.workspace || "platform").trim().toLowerCase();
}

export function notificationBelongsToSurface(item, surface) {
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
    createdAt: row.created_at || "",
    created_at: row.created_at || "",
    read,
    unread: !read,
    actionLabel: "Open",
  };
}
