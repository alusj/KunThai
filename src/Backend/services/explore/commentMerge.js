// A posted comment reaches the list twice: from the insert's reply and from
// the realtime INSERT, in either order. Both must land on the one pending
// copy. A voice comment's pending copy holds the local recording while the
// saved row holds the uploaded file, so audio is matched by presence, not URL.
function isPendingCopyOf(comment, saved) {
  if (!comment?.pending || !saved) return false;
  return (
    comment.post_id === saved.post_id &&
    (comment.parent_comment_id || null) === (saved.parent_comment_id || null) &&
    comment.user_id === saved.user_id &&
    (comment.body || "") === (saved.body || "") &&
    Boolean(comment.audio_url) === Boolean(saved.audio_url)
  );
}

// The list after a saved comment arrives. `pendingId` names the pending copy
// when it is known (the insert's own reply); otherwise one is looked for.
export function mergeSavedComment(comments, saved, pendingId = "") {
  if (!saved?.id) return comments;
  const pendingIndex = comments.findIndex((comment) =>
    pendingId ? comment.id === pendingId : isPendingCopyOf(comment, saved),
  );

  if (comments.some((comment) => comment.id === saved.id)) {
    return pendingIndex >= 0 ? comments.filter((_, index) => index !== pendingIndex) : comments;
  }
  if (pendingIndex >= 0) {
    return comments.map((comment, index) => (index === pendingIndex ? saved : comment));
  }
  return pendingId ? comments : [...comments, saved];
}
