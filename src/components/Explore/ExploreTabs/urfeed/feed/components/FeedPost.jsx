import { useState } from "react";

import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";
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

  useBrowserBack(commentsOpen, () => setCommentsOpen(false), `comments-${post.id}`);

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

  return (
    <article id={`post-${post.id}`} className="relative w-full min-w-0 overflow-visible rounded-[24px] border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md">
      <PostHeader
        post={post}
        isOwner={isOwner}
        followed={followed}
        onFollow={() => runAction(onFollow)}
        onOptions={() => setOptionsOpen((current) => !current)}
        onViewProfile={onViewProfile}
      />

      {optionsOpen ? (
        <PostOptionsMenu
          isOwner={isOwner}
          saved={saved}
          onCopy={() => runAction(() => copyPostLink(post.id))}
          onDelete={() => runAction(onDelete)}
          onEdit={() => runAction(onEdit)}
          onHide={() => runAction(onHide)}
          onReport={() => runAction(onReport)}
          onSave={() => runAction(onSave)}
          onShare={() => runAction(() => sharePost(post))}
          onViewActivity={() => runAction(onViewActivity)}
        />
      ) : null}

      {post.body ? <div className="kuntai-break whitespace-pre-wrap px-4 pb-4 text-[15px] leading-7 text-slate-800">{post.body}</div> : null}

      <PostMedia post={post} />

      <PostActions
        post={post}
        liked={liked}
        saved={saved}
        onLike={onLike}
        onComment={() => setCommentsOpen((current) => !current)}
        onSave={onSave}
        onShare={() => runAction(() => sharePost(post))}
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
