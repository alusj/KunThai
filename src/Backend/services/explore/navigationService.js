const EXPLORE_NAVIGATION_KEY = "exploreNavigation";

const DEFAULT_NAVIGATION = {
  activeTab: "UrFeed",
  menuStack: [],
};
const TAB_HASH_MAP = {
  urfeed: "UrFeed",
  swip: "Swip",
  connections: "Connections",
};

function readHashTab() {
  const hash = String(window.location.hash || "").replace(/^#\/?/, "").toLowerCase();
  const tabKey = hash.split(/[/?&]/)[0];
  return TAB_HASH_MAP[tabKey] || "";
}

export function writeExploreTabHash(activeTab) {
  const tabHash = Object.entries(TAB_HASH_MAP).find(([, value]) => value === activeTab)?.[0];
  if (!tabHash || window.location.hash.replace(/^#\/?/, "").toLowerCase().startsWith(tabHash)) {
    return;
  }

  window.history.replaceState(window.history.state, "", `#/${tabHash}`);
}

export function readExploreNavigation() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXPLORE_NAVIGATION_KEY) || "null");
    const hashTab = readHashTab();
    const navigation = saved && typeof saved === "object" ? { ...DEFAULT_NAVIGATION, ...saved } : DEFAULT_NAVIGATION;
    return hashTab ? { ...navigation, activeTab: hashTab, menuStack: [] } : navigation;
  } catch {
    const hashTab = readHashTab();
    return hashTab ? { ...DEFAULT_NAVIGATION, activeTab: hashTab } : DEFAULT_NAVIGATION;
  }
}

export function writeExploreNavigation(nextNavigation) {
  const navigation = { ...DEFAULT_NAVIGATION, ...nextNavigation };
  try {
    localStorage.setItem(EXPLORE_NAVIGATION_KEY, JSON.stringify(navigation));
  } catch {
    // Keep the in-memory route working if localStorage is unavailable.
  }
  writeExploreTabHash(navigation.activeTab);
}

export function clearExploreScreenStack() {
  const current = readExploreNavigation();
  writeExploreNavigation({ ...current, menuStack: [] });
}
