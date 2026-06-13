import { useEffect, useRef, useState } from "react";
import { HiOutlineChatBubbleLeftRight, HiOutlineXMark } from "react-icons/hi2";

import { useExploreComments } from "../../../../../../Backend/hooks/useExploreComments";
import ErrorState from "../../../../shared/ErrorState";
import useBodyScrollLock from "../../../../../shared/useBodyScrollLock";
import CommentDrawerComposer from "./CommentDrawerComposer";
import CommentItem from "./CommentItem";

const EXIT_MS = 260;

export default function CommentsDrawer({ currentUserId, onClose, onCountChange, onViewProfile, open, post }) {
  const [replyingTo, setReplyingTo] = useState(null);
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const [sendPreview, setSendPreview] = useState(null);
  const listRef = useRef(null);
  const sendPreviewTimerRef = useRef(null);
  const comments = useExploreComments(post?.id, currentUserId, post, open || rendered);
  const isSwip = Boolean(post?.video_url || String(post?.feed_scope || "").toLowerCase() === "swip");
  useBodyScrollLock(rendered);

  useEffect(
    () => () => {
      window.clearTimeout(sendPreviewTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return undefined;
    }

    if (!rendered) {
      return undefined;
    }

    setClosing(true);
    const timeoutId = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
      setReplyingTo(null);
    }, EXIT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [open, rendered]);

  useEffect(() => {
    if (!rendered || closing) return;
    const node = listRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [comments.comments.length, rendered, closing]);

  if (!rendered) {
    return null;
  }

  function requestClose() {
    onClose?.();
  }

  function previewSend(payload) {
    const text = String(payload?.body || "").trim() || (payload?.audio_url ? "Voice comment" : "");
    if (!text) return;

    window.clearTimeout(sendPreviewTimerRef.current);
    const id = Date.now();
    setSendPreview({ id, text });
    sendPreviewTimerRef.current = window.setTimeout(() => {
      setSendPreview((current) => (current?.id === id ? null : current));
    }, 620);
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
    requestClose();
    onViewProfile?.(profile);
  }

  const shellClass = isSwip
    ? "fixed inset-0 z-[1000] flex min-w-0 items-end justify-end sm:items-stretch"
    : "fixed inset-0 z-[1000] flex min-w-0 items-end justify-center";
  const panelMotionClass = isSwip
    ? closing ? "kt-comments-swip-exit" : "kt-comments-swip-enter"
    : closing ? "kt-comments-feed-exit" : "kt-comments-feed-enter";
  const panelSizeClass = isSwip
    ? "h-[84dvh] max-h-[760px] min-h-[420px] w-full rounded-t-[28px] sm:h-full sm:max-h-none sm:max-w-md sm:rounded-l-[28px] sm:rounded-r-none sm:rounded-t-none"
    : "h-[86dvh] max-h-[760px] min-h-[420px] w-full rounded-t-[28px] sm:h-[78dvh] sm:max-w-2xl";
  const backdropClass = closing ? "kt-comments-backdrop-exit" : "kt-comments-backdrop-enter";

  return (
    <div className={shellClass}>
      <button
        type="button"
        className={`absolute inset-0 cursor-default bg-slate-950/35 ${backdropClass}`}
        onClick={requestClose}
        aria-label="Close comments"
      />
      <section className={`relative z-10 flex ${panelSizeClass} min-w-0 flex-col overflow-hidden bg-white shadow-2xl ${panelMotionClass}`}>
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{isSwip ? "Swip comments" : "Comments"}</p>
            <h3 className="truncate text-lg font-black text-slate-950">{post?.comments_count || comments.comments.length || 0} responses</h3>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="kt-pressable flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-700 hover:bg-slate-200"
            aria-label="Close comments"
          >
            <HiOutlineXMark />
          </button>
        </div>

        {sendPreview ? (
          <div key={sendPreview.id} className="kt-comment-send-flight pointer-events-none absolute bottom-[5.4rem] left-4 right-4 z-20 flex justify-center">
            <span className="max-w-[82%] truncate rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-xl shadow-slate-950/20">
              {sendPreview.text}
            </span>
          </div>
        ) : null}

        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 kuntai-scrollbar-none">
          {comments.error ? <ErrorState message={comments.error} onRetry={comments.reload} /> : null}

          {comments.loading && !comments.thread.length ? <CommentLoadingRows /> : null}

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

        <CommentDrawerComposer
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onSendPreview={previewSend}
          onSubmit={addComment}
        />
      </section>
    </div>
  );
}

function CommentLoadingRows() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex gap-3 rounded-[22px] bg-slate-50 p-3">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-36 animate-pulse rounded-full bg-slate-200" />
            <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
            <div className="h-3 w-2/3 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
