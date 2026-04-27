const EXPLORE_NAVIGATION_KEY = "exploreNavigation";

const DEFAULT_NAVIGATION = {
  activeTab: "UrFeed",
  menuStack: [],
};

export function readExploreNavigation() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXPLORE_NAVIGATION_KEY) || "null");
    return saved && typeof saved === "object" ? { ...DEFAULT_NAVIGATION, ...saved } : DEFAULT_NAVIGATION;
  } catch {
    return DEFAULT_NAVIGATION;
  }
}

export function writeExploreNavigation(nextNavigation) {
  localStorage.setItem(EXPLORE_NAVIGATION_KEY, JSON.stringify({ ...DEFAULT_NAVIGATION, ...nextNavigation }));
}

export function clearExploreScreenStack() {
  const current = readExploreNavigation();
  writeExploreNavigation({ ...current, menuStack: [] });
}
