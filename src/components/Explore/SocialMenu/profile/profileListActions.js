// Like/save/comment for a server list: the shared feed hook keeps the account's
// reaction state and syncs it; the list's own counts move with it.
export function buildListActions(list, reactions) {
  function bump(postId, key, delta) {
    list.patchPost(postId, (post) => ({ [key]: Math.max(0, Number(post[key] || 0) + delta) }));
  }
  return {
    likedPosts: reactions.likedPosts,
    savedPosts: reactions.savedPosts,
    toggleLike(postId) {
      bump(postId, "likes_count", reactions.likedPosts.has(postId) ? -1 : 1);
      reactions.toggleLike(postId);
    },
    toggleSave(postId) {
      bump(postId, "saves_count", reactions.savedPosts.has(postId) ? -1 : 1);
      reactions.toggleSave(postId);
    },
    bumpCommentCount(postId, delta = 1) {
      bump(postId, "comments_count", delta);
    },
    editPost: (postId, body) => list.editPost(postId, body),
    deletePost: (postId) => list.deletePost(postId),
  };
}
