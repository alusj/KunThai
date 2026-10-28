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
// company fleet. An operator online solo always gets their solo dashboard
// (and stays online) until they switch themselves. Being online for the
// company never turns the personal dashboard into the company one: the
// company workspace is where that toggle lives, and going online solo first
// asks whether to leave the company offline. Otherwise the choice saved on
// this device decides, and with no choice the solo fleet comes first.
export function resolveOperatorWorkMode({
  hasSoloFleet = false,
  hasCompanyFleet = false,
  soloActive = false,
  storedMode = "",
} = {}) {
  if (!hasCompanyFleet) return "solo";
  if (!hasSoloFleet) return "company";
  if (soloActive) return "solo";
  return storedMode === "company" ? "company" : "solo";
}

// Which company dashboard runs once company mode is chosen, for an operator
// who drives for several companies (`companies`: [{ companyId, active }]).
// The company they picked last stays picked; without a valid pick, the one
// they are online for, then the most recent assignment (first in the list).
export function resolveOperatorCompanyChoice(companies = [], storedCompanyId = "") {
  const list = (companies || []).filter((company) => company?.companyId);
  if (!list.length) return "";
  if (storedCompanyId && list.some((company) => company.companyId === storedCompanyId)) return storedCompanyId;
  return (list.find((company) => company.active) || list[0]).companyId;
}

// Before going online on one dashboard: the other dashboard this operator is
// online on right now (the server allows one at a time and takes the other
// offline), or null. `current` is { mode, companyId }.
export function findOnlineElsewhere({ current = {}, soloActive = false, companies = [] } = {}) {
  if (current.mode !== "solo" && soloActive) return { mode: "solo", companyId: "" };
  const other = (companies || []).find((company) => company?.active
    && !(current.mode === "company" && company.companyId === current.companyId));
  return other ? { mode: "company", companyId: other.companyId, companyName: other.companyName || "" } : null;
}
