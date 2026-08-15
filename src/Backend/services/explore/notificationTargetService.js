export function getExplorePostTargetTab(post) {
  const feedScope = String(post?.feed_scope || "").toLowerCase();
  const postType = String(post?.post_type || "").toLowerCase();
  const category = String(post?.category || "").toLowerCase();
  return feedScope === "swip" || postType === "video" || category === "swip" ? "Swip" : "UrFeed";
}

