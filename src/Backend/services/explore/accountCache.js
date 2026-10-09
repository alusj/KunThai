// Explore keeps three per-account caches in localStorage (settings, privacy
// settings, blocked accounts). They must never carry over to a different
// account on the same device, so the cache remembers which account wrote it.
// No imports: this runs in node tests and inside the auth listener.

export const EXPLORE_ACCOUNT_CACHE_KEYS = Object.freeze([
  "explore-user-settings",
  "explore-privacy-settings",
  "explore-blocked-users",
]);
export const EXPLORE_ACCOUNT_CACHE_OWNER_KEY = "explore-account-cache-owner";
export const EXPLORE_ACCOUNT_CACHE_RESET_EVENT = "kuntai-explore-account-cache-reset";

function defaultStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

// "keep": the cache already belongs to this account (or nobody is signed in).
// "adopt": an older cache with no owner; it is kept for this account.
// "reset": the cache was written by a different account and is discarded.
export function resolveCacheOwnership(storedOwner, userId) {
  if (!userId) return "keep";
  if (storedOwner === userId) return "keep";
  if (!storedOwner) return "adopt";
  return "reset";
}

function announceReset() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    window.dispatchEvent(new CustomEvent(EXPLORE_ACCOUNT_CACHE_RESET_EVENT));
  } catch {
    // CustomEvent can be missing in very old WebViews; hooks re-read on mount.
  }
}

export function clearExploreAccountCache(storage = defaultStorage()) {
  if (!storage) return;
  try {
    EXPLORE_ACCOUNT_CACHE_KEYS.forEach((key) => storage.removeItem(key));
    storage.removeItem(EXPLORE_ACCOUNT_CACHE_OWNER_KEY);
  } catch {
    // Storage can be blocked in private browsers.
  }
  announceReset();
}

// Makes the cache belong to userId, discarding another account's values.
export function claimExploreAccountCache(userId, storage = defaultStorage()) {
  if (!storage || !userId) return "keep";
  let owner = "";
  try {
    owner = storage.getItem(EXPLORE_ACCOUNT_CACHE_OWNER_KEY) || "";
  } catch {
    return "keep";
  }
  const action = resolveCacheOwnership(owner, userId);
  if (action === "keep") return action;
  try {
    if (action === "reset") EXPLORE_ACCOUNT_CACHE_KEYS.forEach((key) => storage.removeItem(key));
    storage.setItem(EXPLORE_ACCOUNT_CACHE_OWNER_KEY, userId);
  } catch {
    return action;
  }
  if (action === "reset") announceReset();
  return action;
}

// True when this device holds a saved value for key that belongs to userId.
export function hasOwnedCacheValue(key, userId, storage = defaultStorage()) {
  if (!storage || !userId) return false;
  try {
    return storage.getItem(EXPLORE_ACCOUNT_CACHE_OWNER_KEY) === userId && storage.getItem(key) !== null;
  } catch {
    return false;
  }
}
