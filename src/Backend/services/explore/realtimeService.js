import supabase from "../../lib/supabaseClient";

export function subscribeToExplorePosts(scope, handlers) {
  const channel = supabase
    .channel(`explore-posts-${scope}`)
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "explore_posts" }, handlers.onDelete)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "explore_posts" }, handlers.onInsert)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "explore_posts" }, handlers.onUpdate)
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function subscribeToCurrentUserReactions(userId, handlers) {
  if (!userId) {
    return () => {};
  }

  const channel = supabase
    .channel(`explore-reactions-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "explore_post_likes", filter: `user_id=eq.${userId}` },
      handlers.onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "explore_post_saves", filter: `user_id=eq.${userId}` },
      handlers.onChange,
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function subscribeToExploreComments(postId, handlers) {
  if (!postId) {
    return () => {};
  }

  const channel = supabase
    .channel(`explore-comments-${postId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "explore_post_comments", filter: `post_id=eq.${postId}` },
      handlers.onInsert,
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "explore_post_comments", filter: `post_id=eq.${postId}` },
      handlers.onUpdate,
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "explore_post_comments", filter: `post_id=eq.${postId}` },
      handlers.onDelete,
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function subscribeToCurrentUserCommentLikes(userId, handlers) {
  if (!userId) {
    return () => {};
  }

  const channel = supabase
    .channel(`explore-comment-likes-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "explore_comment_likes", filter: `user_id=eq.${userId}` },
      handlers.onChange,
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
