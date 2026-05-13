export const POSTS_STORAGE_PREFIX = "explore-posts";
export const LIKE_STORAGE_KEY = "explore-liked-posts";
export const SAVE_STORAGE_KEY = "explore-saved-posts";
export const HIDE_STORAGE_KEY = "explore-hidden-posts";
export const EXPLORE_CACHE_EVENT = "explore-cache-updated";
const MAX_STORED_POSTS = 50;

function isInlineMediaUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function sanitizePostForStorage(post) {
  if (!post || typeof post !== "object") {
    return null;
  }

  return {
    ...post,
    image_url: isInlineMediaUrl(post.image_url) ? "" : post.image_url || "",
    audio_url: isInlineMediaUrl(post.audio_url) ? "" : post.audio_url || "",
    video_url: isInlineMediaUrl(post.video_url) ? "" : post.video_url || "",
    upload_status: isInlineMediaUrl(post.video_url) || isInlineMediaUrl(post.image_url) || isInlineMediaUrl(post.audio_url)
      ? "preparing"
      : post.upload_status || "",
  };
}

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
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(setValue)));
  } catch {
    // Storage can be unavailable or full on mobile Safari private/low-space modes.
  }
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
  try {
    const safePosts = (Array.isArray(posts) ? posts : [])
      .map(sanitizePostForStorage)
      .filter(Boolean)
      .filter((post) => post.image_url || post.audio_url || post.video_url || !String(post.id || "").startsWith("local-"))
      .slice(0, MAX_STORED_POSTS);

    localStorage.setItem(key, JSON.stringify(safePosts));
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures.
    }
  }
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
