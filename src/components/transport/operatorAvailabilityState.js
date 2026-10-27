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

// The availability control's label (a urrideLiveDiscovery key). Availability
// only: "Online" never implies passengers can see the operator — location
// sharing and visibility are shown separately. While saving it names the
// change in flight; the saved state only flips after Supabase confirms it.
export function availabilityLabelKey({ active = false, saving = false } = {}) {
  if (saving) return active ? "statusGoingOffline" : "statusGoingOnline";
  return active ? "statusOnline" : "statusOffline";
}

// Which fleet the dashboard runs for an operator with a solo fleet and/or a
// company fleet. The fleet that is online always wins, so an operator who
// went online solo stays on their solo dashboard (and stays online) until
// they switch themselves; only with both offline does the choice saved on
// this device decide, and with no choice the solo fleet comes first.
export function resolveOperatorWorkMode({
  hasSoloFleet = false,
  hasCompanyFleet = false,
  soloActive = false,
  companyActive = false,
  storedMode = "",
} = {}) {
  if (!hasCompanyFleet) return "solo";
  if (!hasSoloFleet) return "company";
  if (soloActive) return "solo";
  if (companyActive) return "company";
  return storedMode === "company" ? "company" : "solo";
}
