export const SWIP_CATEGORIES = [
  { id: "all", label: "All" },
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

  return SWIP_CATEGORIES.find((category) => category.id !== "all" && text.includes(category.id))?.id || "all";
}

export function filterSwipVideos(posts, categoryId, onlyUserId = "") {
  return (posts || []).filter((post) => {
    if (!post.video_url) {
      return false;
    }

    if (onlyUserId && post.user_id !== onlyUserId) {
      return false;
    }

    if (categoryId === "all") {
      return true;
    }

    return getVideoCategory(post) === categoryId;
  });
}
