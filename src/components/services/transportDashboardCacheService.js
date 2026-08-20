const TRANSPORT_DASHBOARD_CACHE_PREFIX = "kuntai.transport.dashboard.v1";
// A long-lived first-paint snapshot is safe because every dashboard mount
// revalidates it. It prevents an empty screen after a long inactive period.
const MAX_SNAPSHOT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeScopePart(value, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return (normalized || fallback).replace(/[^a-z0-9_-]/g, "-").slice(0, 96);
}

function cacheKey({ userId = "", countryIso = "" } = {}) {
  const account = normalizeScopePart(userId, "guest");
  const country = normalizeScopePart(countryIso, "unknown");
  return `${TRANSPORT_DASHBOARD_CACHE_PREFIX}:${account}:${country}`;
}

function normalizeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

function normalizeSummary(summary) {
  if (!summary || typeof summary !== "object") return null;

  return {
    topRatedCount: normalizeCount(summary.topRatedCount),
    activeTripsCount: normalizeCount(summary.activeTripsCount),
    savedOperatorsCount: normalizeCount(summary.savedOperatorsCount),
  };
}

function normalizeOperators(operators) {
  if (!Array.isArray(operators)) return [];
  // The dashboard only paints six nearby cards. Keeping the snapshot bounded
  // avoids turning localStorage into a second fleet database.
  return operators.filter((operator) => operator?.id).slice(0, 6);
}

export function readTransportDashboardSnapshot(scope = {}) {
  if (typeof window === "undefined") return null;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(cacheKey(scope)) || "null");
    const savedAt = Number(parsed?.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > MAX_SNAPSHOT_AGE_MS) {
      window.localStorage.removeItem(cacheKey(scope));
      return null;
    }

    const summary = normalizeSummary(parsed.summary);
    const operators = normalizeOperators(parsed.operators);
    if (!summary && !operators.length) return null;

    return { savedAt, summary, operators };
  } catch {
    return null;
  }
}

export function writeTransportDashboardSnapshot(scope = {}, patch = {}) {
  if (typeof window === "undefined") return null;

  try {
    const current = readTransportDashboardSnapshot(scope) || {};
    const next = {
      savedAt: Date.now(),
      summary: normalizeSummary(patch.summary) || current.summary || null,
      operators: Array.isArray(patch.operators)
        ? normalizeOperators(patch.operators)
        : normalizeOperators(current.operators),
    };

    window.localStorage.setItem(cacheKey(scope), JSON.stringify(next));
    return next;
  } catch {
    // Storage can be unavailable in private mode or under strict policies.
    // Dashboard loading must continue normally in that case.
    return null;
  }
}

export function clearTransportDashboardSnapshots(userId = "") {
  if (typeof window === "undefined") return;

  const account = normalizeScopePart(userId, "guest");
  const prefix = `${TRANSPORT_DASHBOARD_CACHE_PREFIX}:${account}:`;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch {
    // Best-effort cleanup only.
  }
}
