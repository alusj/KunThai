import { useEffect, useRef, useState } from "react";

import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";
import { createExploreNotification } from "../../../../../../Backend/services/exploreService";
import CommentsDrawer from "../comments/CommentsDrawer";
import PostActions from "../post/PostActions";
import PostHeader from "../post/PostHeader";
import PostMedia from "../post/PostMedia";
import PostOptionsMenu from "../post/PostOptionsMenu";
import { copyPostLink, sharePost } from "../post/postUtils";

export default function FeedPost({
  post,
  currentUserId = "",
  liked = false,
  saved = false,
  isOwner = false,
  onLike,
  onSave,
  onCommentCountChange,
  onEdit,
  onDelete,
  onHide,
  onReport,
  onViewActivity,
  onViewProfile,
  followed = false,
  onFollow,
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState(post.body || "");
  const [menuMessage, setMenuMessage] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const optionsRef = useRef(null);

  useBrowserBack(commentsOpen, () => setCommentsOpen(false), `comments-${post.id}`);

  useEffect(() => {
    function handleOpenPostComments(event) {
      if (String(event.detail?.postId || "") !== String(post.id)) return;
      setCommentsOpen(true);
    }

    window.addEventListener("explore-open-post-comments", handleOpenPostComments);
    return () => window.removeEventListener("explore-open-post-comments", handleOpenPostComments);
  }, [post.id]);

  useEffect(() => {
    if (!optionsOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (event.target?.closest?.(`[data-post-options-toggle="${post.id}"]`)) {
        return;
      }

      if (optionsRef.current?.contains(event.target)) {
        return;
      }

      setOptionsOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOptionsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [optionsOpen, post.id]);

  async function runAction(action) {
    setOptionsOpen(false);

    try {
      const message = await action?.();
      if (message) {
        setMenuMessage(message);
      }
    } catch {
      setMenuMessage("Action could not be completed");
    }
  }

  async function shareAndNotify() {
    const message = await sharePost(post);
    if (post.user_id && post.user_id !== currentUserId) {
      await createExploreNotification({
        user_id: post.user_id,
        type: "share",
        post_id: post.id,
        post_preview: post.body,
        media_type: post.video_url ? "video post" : post.image_url ? "photo post" : "post",
      });
    }
    return message;
  }

  async function submitEdit(event) {
    event.preventDefault();
    await runAction(() => onEdit?.(editValue));
    setEditOpen(false);
  }

  async function submitReport(event) {
    event.preventDefault();
    await runAction(() => onReport?.(reportReason));
    setReportReason("");
    setReportOpen(false);
  }

  async function confirmDelete() {
    await runAction(onDelete);
    setDeleteOpen(false);
  }

  return (
    <article
      id={`post-${post.id}`}
      className={`relative w-full max-w-full min-w-0 rounded-[24px] border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md ${
        optionsOpen ? "z-40 overflow-visible" : "overflow-hidden"
      }`}
    >
      <PostHeader
        post={post}
        isOwner={isOwner}
        followed={followed}
        onFollow={() => runAction(onFollow)}
        onOptions={() => setOptionsOpen((current) => !current)}
        onViewProfile={onViewProfile}
      />

      {optionsOpen ? (
        <div ref={optionsRef}>
          <PostOptionsMenu
            followed={followed}
            isOwner={isOwner}
            saved={saved}
            onCopy={() => runAction(() => copyPostLink(post.id))}
            onDelete={() => {
              setOptionsOpen(false);
              setDeleteOpen(true);
            }}
            onEdit={() => {
              setOptionsOpen(false);
              setEditValue(post.body || "");
              setEditOpen(true);
            }}
            onFollow={() => runAction(onFollow)}
            onHide={() => runAction(onHide)}
            onReport={() => {
              setOptionsOpen(false);
              setReportOpen(true);
            }}
            onSave={() => runAction(onSave)}
            onShare={() => runAction(shareAndNotify)}
            onViewActivity={() => runAction(onViewActivity)}
          />
        </div>
      ) : null}

      {post.body ? <div className="kuntai-break whitespace-pre-wrap px-4 pb-4 text-base font-semibold leading-7 text-slate-900">{post.body}</div> : null}

      <PostMedia post={post} />

      <PostActions
        post={post}
        liked={liked}
        onLike={onLike}
        onComment={() => setCommentsOpen((current) => !current)}
        onShare={() => runAction(shareAndNotify)}
      />

      <CommentsDrawer
        currentUserId={currentUserId}
        open={commentsOpen}
        post={post}
        onClose={() => setCommentsOpen(false)}
        onCountChange={onCommentCountChange}
        onViewProfile={onViewProfile}
      />

      {menuMessage ? <p className="px-4 pb-3 text-xs font-bold text-sky-700">{menuMessage}</p> : null}
      {editOpen ? (
        <div className="absolute inset-0 z-30 flex items-end bg-slate-950/30 px-3 pb-3 backdrop-blur-sm" onClick={() => setEditOpen(false)}>
          <form className="w-full rounded-[24px] bg-white p-4 shadow-2xl" onSubmit={submitEdit} onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Edit post</p>
            <textarea
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              rows={4}
              className="mt-3 w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-800 outline-none"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditOpen(false)} className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                Cancel
              </button>
              <button type="submit" className="h-11 rounded-2xl bg-slate-950 text-sm font-black text-white">
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {reportOpen ? (
        <div className="absolute inset-0 z-30 flex items-end bg-slate-950/30 px-3 pb-3 backdrop-blur-sm" onClick={() => setReportOpen(false)}>
          <form className="w-full rounded-[24px] bg-white p-4 shadow-2xl" onSubmit={submitReport} onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-600">Report post</p>
            <textarea
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              placeholder="Tell us what is wrong."
              rows={4}
              className="mt-3 w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-800 outline-none"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setReportOpen(false)} className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={!reportReason.trim()} className="h-11 rounded-2xl bg-rose-600 text-sm font-black text-white disabled:opacity-50">
                Report
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {deleteOpen ? (
        <div className="absolute inset-0 z-30 flex items-end bg-slate-950/30 px-3 pb-3 backdrop-blur-sm" onClick={() => setDeleteOpen(false)}>
          <div className="w-full rounded-[24px] bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-600">Delete post</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Remove this post?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">This removes it from Explore and your profile.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDeleteOpen(false)} className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                Cancel
              </button>
              <button type="button" onClick={confirmDelete} className="h-11 rounded-2xl bg-rose-600 text-sm font-black text-white">
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
