// Fresh details for the posts already listed: same posts, same order. A post
// keeps its place (its ranking fields) and, while one of the person's own
// likes or saves is still being sent, its counts. Posts with nothing new keep
// their identity, so their cards are not drawn again; with nothing new at
// all the same list comes back.
export function refreshPostsInPlace(current, freshPosts, isSyncing = () => false) {
  const fresh = new Map((freshPosts || []).filter((post) => post?.id).map((post) => [post.id, post]));
  let changed = false;
  const next = current.map((post) => {
    const update = fresh.get(post?.id);
    if (!update) return post;
    const merged = {
      ...post,
      ...update,
      recommendation_score: post.recommendation_score ?? update.recommendation_score,
      score: post.score ?? update.score,
      recommendation_surface: post.recommendation_surface ?? update.recommendation_surface,
      ...(isSyncing(post.id) ? { likes_count: post.likes_count, saves_count: post.saves_count } : {}),
    };
    const same = Object.keys(merged).every((key) => (
      merged[key] === post[key]
      || (typeof merged[key] === "object" && JSON.stringify(merged[key]) === JSON.stringify(post[key]))
    ));
    if (same) return post;
    changed = true;
    return merged;
  });
  return changed ? next : current;
}
