const SWIP_CATEGORIES = [
  { id: "entertainment", label: "Entertainment" },
  { id: "connections", label: "Connections" },
  { id: "religious", label: "Religious" },
  { id: "health", label: "Health" },
  { id: "education", label: "Education" },
];

export function getVideoCategory(post) {
  const text = [post?.swip_category, post?.category, post?.body, ...(post?.hashtags || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return SWIP_CATEGORIES.find((category) => text.includes(category.id))?.id || "";
}

export function getVideoCategoryLabel(post) {
  const category = getVideoCategory(post);
  return SWIP_CATEGORIES.find((item) => item.id === category)?.label || "";
}

export function getSwipContext(post, currentUserId = "") {
  if (currentUserId && post?.user_id === currentUserId) {
    return "Your Swip";
  }

  if (post?.isFollowing || post?.feed_scope === "connections" || post?.source === "circle") {
    return "From your circle";
  }

  return "Suggested";
}

export function getSwipVideos(posts, onlyUserId = "") {
  return (posts || [])
    .map(normalizeSwipPost)
    .filter((post) => {
      if (!post?.id || !post.video_url) {
        return false;
      }

      if (onlyUserId && post.user_id !== onlyUserId) {
        return false;
      }

      return true;
    });
}

export function normalizeSwipPost(post) {
  if (!post || typeof post !== "object") {
    return null;
  }

  const videoUrl = typeof post.video_url === "string" ? post.video_url.trim() : "";
  if (!post.id || !videoUrl) {
    return null;
  }

  return {
    ...post,
    id: String(post.id),
    user_id: String(post.user_id || ""),
    author_name: String(post.author_name || post.profile?.display_name || post.profile?.name || "Profile"),
    author_username: String(post.author_username || post.profile?.username || "user").replace(/^@/, ""),
    author_avatar_url: String(post.author_avatar_url || post.profile?.avatar_url || ""),
    video_url: videoUrl,
    body: String(post.body || ""),
    created_at: post.created_at || new Date().toISOString(),
    likes_count: Number.isFinite(Number(post.likes_count)) ? Number(post.likes_count) : 0,
    comments_count: Number.isFinite(Number(post.comments_count)) ? Number(post.comments_count) : 0,
    saves_count: Number.isFinite(Number(post.saves_count)) ? Number(post.saves_count) : 0,
    hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
    mentions: Array.isArray(post.mentions) ? post.mentions : [],
  };
}

export function isRenderableSwipPost(post) {
  const normalized = normalizeSwipPost(post);
  if (!normalized) {
    return false;
  }

  try {
    const url = new URL(normalized.video_url, window.location.href);
    if (!["http:", "https:", "blob:", "data:"].includes(url.protocol)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
