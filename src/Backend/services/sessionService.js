import supabase from "../lib/supabaseClient";

const SOCIAL_CACHE_KEYS = [
  "explore-liked-posts",
  "explore-saved-posts",
  "explore-hidden-posts",
  "explore-notifications-cache",
  "explore-posts-feed",
  "explore-posts-connections",
];
const EXPLORE_NAVIGATION_KEY = "exploreNavigation";
const DEFAULT_EXPLORE_NAVIGATION = {
  activeTab: "UrFeed",
  menuStack: [],
};

function clearSocialSessionCache() {
  SOCIAL_CACHE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });
}

export function clearTransientSessionNavigation() {
  try {
    localStorage.setItem(EXPLORE_NAVIGATION_KEY, JSON.stringify(DEFAULT_EXPLORE_NAVIGATION));
    sessionStorage.removeItem("exploreFeedScrollY");
  } catch {
    // Storage can be blocked in private browsers; sign-out should still work.
  }

  if (window.location.hash) {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }
}

export async function signOutSocialSession() {
  clearSocialSessionCache();
  clearTransientSessionNavigation();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function switchSocialAccount() {
  clearSocialSessionCache();
  await signOutSocialSession();
}
