export const POSTS_STORAGE_PREFIX = "explore-posts";
export const LIKE_STORAGE_KEY = "explore-liked-posts";
export const SAVE_STORAGE_KEY = "explore-saved-posts";
export const HIDE_STORAGE_KEY = "explore-hidden-posts";
export const EXPLORE_CACHE_EVENT = "explore-cache-updated";

export function getPostsStorageKey(scope) {
  return `${POSTS_STORAGE_PREFIX}-${scope}`;
}

export function readStoredSet(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

export function writeStoredSet(key, setValue) {
  localStorage.setItem(key, JSON.stringify(Array.from(setValue)));
}

export function readStoredPosts(scope) {
  try {
    const value = JSON.parse(localStorage.getItem(getPostsStorageKey(scope)) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeStoredPosts(scope, posts) {
  const key = getPostsStorageKey(scope);
  localStorage.setItem(key, JSON.stringify(posts));
}

export function removePostFromAllCaches(postId) {
  ["feed", "connections", "swip"].forEach((scope) => {
    const key = getPostsStorageKey(scope);
    try {
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(items)) {
        localStorage.setItem(key, JSON.stringify(items.filter((post) => post.id !== postId)));
      }
    } catch {
      // Ignore invalid local cache entries.
    }
  });
  window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { postId, type: "delete-post" } }));
}
