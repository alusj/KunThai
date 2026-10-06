export const COMMENT_SORTS = ["newest", "top", "oldest"];
export const DEFAULT_COMMENT_SORT = "newest";

const SORT_STORAGE_KEY = "explore-comment-sort";

function postedAt(comment) {
  const time = Date.parse(comment?.created_at || "");
  return Number.isFinite(time) ? time : 0;
}

// Likes count once, replies count double: a reply is a stronger signal that a
// comment started a conversation worth reading.
export function commentPopularity(comment) {
  const likes = Number(comment?.likes_count) || 0;
  const replies = Array.isArray(comment?.replies) ? comment.replies.length : 0;
  return likes + replies * 2;
}

// Orders top-level comments only; replies stay in posted order under their
// parent so a conversation still reads top to bottom.
export function sortCommentThread(thread, mode = DEFAULT_COMMENT_SORT) {
  const items = Array.isArray(thread) ? [...thread] : [];
  if (mode === "oldest") return items.sort((a, b) => postedAt(a) - postedAt(b));
  if (mode === "top") {
    return items.sort((a, b) => commentPopularity(b) - commentPopularity(a) || postedAt(b) - postedAt(a));
  }
  return items.sort((a, b) => postedAt(b) - postedAt(a));
}

export function readCommentSort() {
  try {
    const value = localStorage.getItem(SORT_STORAGE_KEY);
    return COMMENT_SORTS.includes(value) ? value : DEFAULT_COMMENT_SORT;
  } catch {
    return DEFAULT_COMMENT_SORT;
  }
}

export function writeCommentSort(mode) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in private mode; the choice lasts this session.
  }
}
