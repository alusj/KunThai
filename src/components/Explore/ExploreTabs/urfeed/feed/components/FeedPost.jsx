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
  onComment,
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
  const [menuMessage, setMenuMessage] = useState("");
  const optionsRef = useRef(null);

  useBrowserBack(commentsOpen, () => setCommentsOpen(false), `comments-${post.id}`);

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
  }, [optionsOpen]);

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
    if (post.user_id) {
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

  return (
    <article id={`post-${post.id}`} className="relative w-full max-w-full min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md">
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
            onDelete={() => runAction(onDelete)}
            onEdit={() => runAction(onEdit)}
            onFollow={() => runAction(onFollow)}
            onHide={() => runAction(onHide)}
            onReport={() => runAction(onReport)}
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
        saved={saved}
        onLike={onLike}
        onComment={() => setCommentsOpen((current) => !current)}
        onSave={onSave}
        onShare={() => runAction(shareAndNotify)}
      />

      <CommentsDrawer
        currentUserId={currentUserId}
        open={commentsOpen}
        post={post}
        onClose={() => setCommentsOpen(false)}
        onCreated={onComment}
        onViewProfile={onViewProfile}
      />

      {menuMessage ? <p className="px-4 pb-3 text-xs font-bold text-sky-700">{menuMessage}</p> : null}
    </article>
  );
}
