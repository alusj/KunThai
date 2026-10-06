// Filter + order for "Suggested accounts" (UrFeed card and Connections →
// Suggested). Items come from get_people_you_may_know_v2, already ranked:
// follows you > mutual connections > chatted > near you > interests > new.

export const SUGGESTION_FILTERS = ["recommended", "know", "nearby", "new"];
export const DEFAULT_SUGGESTION_FILTER = "recommended";

const STORAGE_KEY = "explore-suggestion-filter";

function knowRank(item) {
  return (item.followsYou ? 1000 : 0) + Math.min(Number(item.mutual_count) || 0, 50) * 10 + (item.chatted ? 5 : 0);
}

export function applySuggestionFilter(items = [], filter = DEFAULT_SUGGESTION_FILTER) {
  const list = Array.isArray(items) ? items : [];
  if (filter === "know") {
    return list
      .filter((item) => item.followsYou || Number(item.mutual_count) > 0 || item.chatted)
      .map((item, index) => ({ item, index }))
      .sort((a, b) => knowRank(b.item) - knowRank(a.item) || a.index - b.index)
      .map((entry) => entry.item);
  }
  if (filter === "nearby") return list.filter((item) => item.nearby);
  if (filter === "new") return list.filter((item) => item.isNew);
  return list;
}

// Translation key (+ vars) for why someone is suggested, or null.
export function suggestionReason(item = {}) {
  const mutuals = Number(item.mutual_count) || 0;
  switch (item.reasonKind) {
    case "follows_you": return { key: "feed.reasonFollowsYou" };
    case "mutual": return mutuals === 1 ? { key: "feed.reasonMutualOne" } : { key: "feed.reasonMutual", vars: { count: mutuals } };
    case "chatted": return { key: "feed.reasonChatted" };
    case "nearby": return { key: "feed.reasonNearby" };
    case "interests": return { key: "feed.reasonInterests" };
    case "new": return { key: "feed.reasonNew" };
    case "suggested": return { key: "feed.reasonSuggested" };
    default: return null;
  }
}

export function readSuggestionFilter() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return SUGGESTION_FILTERS.includes(value) ? value : DEFAULT_SUGGESTION_FILTER;
  } catch {
    return DEFAULT_SUGGESTION_FILTER;
  }
}

export function writeSuggestionFilter(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable; the choice lasts this session.
  }
}
