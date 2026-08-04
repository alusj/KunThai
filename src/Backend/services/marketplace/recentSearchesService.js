// Lightweight, privacy-respecting recent-search history for UrMall.
//
// Stored locally on the device only (no server, no personal data). Powers the
// empty-state of the search box so shoppers can jump back to a previous term.

const RECENT_SEARCHES_KEY = "marketplace-recent-searches";
const MAX_RECENT = 8;

export function getRecentMarketplaceSearches() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((term) => typeof term === "string" && term.trim()) : [];
  } catch {
    return [];
  }
}

export function addRecentMarketplaceSearch(term) {
  const trimmed = String(term || "").trim();
  if (trimmed.length < 2) return getRecentMarketplaceSearches();
  try {
    const current = getRecentMarketplaceSearches();
    const next = [trimmed, ...current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    return next;
  } catch {
    return getRecentMarketplaceSearches();
  }
}

export function clearRecentMarketplaceSearches() {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Best effort only.
  }
  return [];
}
