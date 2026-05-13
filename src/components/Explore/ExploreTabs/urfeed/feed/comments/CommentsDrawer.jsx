import { useEffect, useRef, useState } from "react";
import { HiOutlineChatBubbleLeftRight, HiOutlineXMark } from "react-icons/hi2";

import { useExploreComments } from "../../../../../../Backend/hooks/useExploreComments";
import ErrorState from "../../../../shared/ErrorState";
import CommentDrawerComposer from "./CommentDrawerComposer";
import CommentItem from "./CommentItem";

export default function CommentsDrawer({ currentUserId, onClose, onCountChange, onViewProfile, open, post }) {
  const [replyingTo, setReplyingTo] = useState(null);
  const listRef = useRef(null);
  const comments = useExploreComments(post?.id, currentUserId, post);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const scrollY = window.scrollY;
    const previousBody = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = previousBody.overflow;
      document.body.style.position = previousBody.position;
      document.body.style.top = previousBody.top;
      document.body.style.width = previousBody.width;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [comments.comments.length, open]);

  if (!open) {
    return null;
  }

  async function addComment(payload) {
    onCountChange?.(1);
    const result = await comments.addComment(payload);
    if (result?.ok === false) {
      onCountChange?.(-1);
    }
    return result;
  }

  function viewProfile(profile) {
    onClose?.();
    onViewProfile?.(profile);
  }

  return (
    <div className="fixed inset-0 z-[65] flex min-w-0 items-end">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close comments"
      />
      <section className="relative z-10 flex h-[86dvh] max-h-[760px] min-h-[420px] w-full min-w-0 flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:mx-auto sm:h-[78dvh] sm:max-w-2xl">
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Comments</p>
            <h3 className="truncate text-lg font-black text-slate-950">{post?.comments_count || comments.comments.length || 0} responses</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-700"
            aria-label="Close comments"
          >
            <HiOutlineXMark />
          </button>
        </div>

        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 kuntai-scrollbar-none">
          {comments.error ? <ErrorState message={comments.error} onRetry={comments.reload} /> : null}

          {!comments.loading && !comments.thread.length ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <HiOutlineChatBubbleLeftRight className="mx-auto text-3xl text-slate-400" />
              <p className="mt-3 text-sm font-black text-slate-950">Start the conversation</p>
              <p className="mt-1 text-sm text-slate-500">Text and voice comments will appear here.</p>
            </div>
          ) : null}

          {comments.thread.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              isLiked={(commentId) => comments.likedComments.has(commentId)}
              replies={comment.replies}
              isOwner={comments.isOwner(comment)}
              liked={comments.likedComments.has(comment.id)}
              onDelete={comments.removeComment}
              onLike={comments.toggleCommentLike}
              onViewProfile={viewProfile}
              onReply={setReplyingTo}
              onReport={comments.reportComment}
            />
          ))}
        </div>

        <CommentDrawerComposer replyingTo={replyingTo} onCancelReply={() => setReplyingTo(null)} onSubmit={addComment} />
      </section>
    </div>
  );
}
