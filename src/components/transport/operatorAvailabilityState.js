export const AVAILABILITY_REFRESH_GRACE_MS = 8000;

export function resolveFleetAvailability(fleet, requestedActive = false) {
  const status = String(fleet?.active_status || fleet?.activeStatus || "").toLowerCase();
  if (status === "active") return true;
  if (status === "offline") return false;
  return Boolean(requestedActive);
}

export function shouldPreserveAvailabilityOverride(override, reportedActive, now = Date.now()) {
  return Boolean(
    override &&
      Number(override.expiresAt || 0) > now &&
      Boolean(override.active) !== Boolean(reportedActive),
  );
}
