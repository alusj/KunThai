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
  return (posts || []).filter((post) => {
    if (!post.video_url) {
      return false;
    }

    if (onlyUserId && post.user_id !== onlyUserId) {
      return false;
    }

    return true;
  });
}
