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
  const mediaMeta = post?.media_meta || post?.mediaMeta || {};
  if (post?.post_type === "advert" || post?.category === "advert" || mediaMeta?.advert) {
    return "Sponsored";
  }

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

export function getSwipRepostSnapshot(post) {
  const snapshot = post?.media_meta?.repost || post?.mediaMeta?.repost || null;
  return snapshot?.videoUrl ? snapshot : null;
}

export function normalizeSwipPost(post) {
  if (!post || typeof post !== "object") {
    return null;
  }

  // A shared Swip carries the original video inside the repost snapshot so the
  // shared entry plays in place while crediting the original creator.
  const repost = getSwipRepostSnapshot(post);
  const ownVideoUrl = typeof post.video_url === "string" ? post.video_url.trim() : "";
  const videoUrl = ownVideoUrl || String(repost?.videoUrl || "").trim();
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
    video_trim_start: post.video_trim_start ?? (ownVideoUrl ? null : repost?.videoTrimStart) ?? null,
    video_trim_end: post.video_trim_end ?? (ownVideoUrl ? null : repost?.videoTrimEnd) ?? null,
    swipRepost: ownVideoUrl ? null : repost,
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

// Tall clips (9:16 and taller, give or take a little) fill the screen; anything
// wider (3:4, square, 16:9) shows whole over a blurred copy of itself, the way
// TikTok and Reels show TV-format video.
const SWIP_FILL_MAX_ASPECT = 0.68;
const swipVideoSizes = new Map();

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function getSwipVideoFit(width, height) {
  const w = positiveNumber(width);
  const h = positiveNumber(height);
  if (!w || !h) return "";
  return w / h <= SWIP_FILL_MAX_ASPECT ? "fill" : "fit";
}

// The fit already known for a post: stored size, or one seen on this device.
export function getKnownSwipVideoFit(post) {
  const meta = post?.media_meta || post?.mediaMeta || {};
  const stored = getSwipVideoFit(
    meta.videoWidth ?? meta.width ?? post?.video_width,
    meta.videoHeight ?? meta.height ?? post?.video_height,
  );
  if (stored) return stored;
  const seen = post?.id ? swipVideoSizes.get(post.id) : null;
  return seen ? getSwipVideoFit(seen.width, seen.height) : "";
}

export function rememberSwipVideoSize(postId, width, height) {
  if (!postId || !getSwipVideoFit(width, height)) return;
  swipVideoSizes.set(postId, { width, height });
}
