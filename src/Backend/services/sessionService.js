import supabase from "../lib/supabaseClient";

const SOCIAL_CACHE_KEYS = [
  "explore-liked-posts",
  "explore-saved-posts",
  "explore-hidden-posts",
  "explore-notifications-cache",
  "explore-posts-feed",
  "explore-posts-connections",
];

function clearSocialSessionCache() {
  SOCIAL_CACHE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });
}

export async function signOutSocialSession() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function switchSocialAccount() {
  clearSocialSessionCache();
  await signOutSocialSession();
}
