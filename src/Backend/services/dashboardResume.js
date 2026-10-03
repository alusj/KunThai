// When KunThai comes back from a long time in the background it should open on
// a main dashboard (Explore, UrMall or UrRide), not on whatever inner screen
// (messages, settings, a profile...) happened to be open. Short interruptions
// keep the current screen.
//
// Screens that must survive any interruption — live Area View navigation, an
// operator's or passenger's trip in progress — place a hold while active.

export const DASHBOARD_RESUME_AFTER_MS = 15 * 60 * 1000;

const MAIN_DASHBOARDS = ["explore", "marketplace", "transport"];
const holds = new Map();
let nextHoldId = 1;

// Prevent the reset while `reason` is in progress. Returns a release function.
export function holdDashboardResume(reason = "screen") {
  const id = nextHoldId++;
  holds.set(id, reason);
  return () => holds.delete(id);
}

export function isDashboardResumeHeld() {
  return holds.size > 0;
}

export function shouldResetToDashboard(awayMs, { held = isDashboardResumeHeld() } = {}) {
  return !held && Number.isFinite(awayMs) && awayMs >= DASHBOARD_RESUME_AFTER_MS;
}

// The person's explicit default dashboard, else the one they chose while
// onboarding, else Explore.
export function resolveResumeDashboard({ explicitDefault = "", primarySurface = "" } = {}) {
  if (MAIN_DASHBOARDS.includes(explicitDefault)) return explicitDefault;
  const chosen = String(primarySurface || "").toLowerCase();
  if (chosen === "urmall") return "marketplace";
  if (chosen === "urride") return "transport";
  if (MAIN_DASHBOARDS.includes(chosen)) return chosen;
  return "explore";
}
