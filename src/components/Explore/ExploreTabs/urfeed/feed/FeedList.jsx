import { useRef, useState } from "react";

import { useExploreFollows } from "../../../../../Backend/hooks/useExploreFollows";
import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import FeedPost from "./components/FeedPost";

export default function FeedList({
  posts,
  loading,
  error,
  onRetry,
  likedPosts,
  savedPosts,
  onLike,
  onSave,
  onCommentCountChange,
  onEdit,
  onDelete,
  onHide,
  onReport,
  onViewActivity,
  onViewProfile,
  currentUserId,
  actionsByScope,
  profile,
  emptyTitle = "No posts yet",
  emptyMessage = "The feed is empty right now. Be the first to share something.",
  showEmpty = false,
}) {
  const [refreshing, setRefreshing] = useState(false);
  const touchStartRef = useRef(null);
  const { followedUsers, toggleFollow } = useExploreFollows(currentUserId);

  async function refresh() {
    if (!onRetry || refreshing) {
      return;
    }

    setRefreshing(true);
    try {
      await onRetry();
    } finally {
      setRefreshing(false);
    }
  }

  function handleTouchStart(event) {
    if (window.scrollY <= 2) {
      touchStartRef.current = event.touches[0]?.clientY || null;
    }
  }

  function handleTouchEnd(event) {
    const startY = touchStartRef.current;
    touchStartRef.current = null;

    if (startY === null) {
      return;
    }

    const endY = event.changedTouches[0]?.clientY || startY;
    if (endY - startY > 70) {
      refresh();
    }
  }

  async function handleFollow(post) {
    const active = await toggleFollow(post.user_id);

    if (active && post.user_id) {
      return "Following";
    }

    return active === false ? "Unfollowed" : "";
  }

  if (error) {
    return (
      <div className="mt-4 w-full overflow-x-clip px-4 sm:px-5 lg:px-8">
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (loading && !posts?.length) {
    return <FeedListSkeleton />;
  }

  if (!posts?.length) {
    if (!showEmpty) {
      return null;
    }

    return (
      <div className="mt-4 w-full overflow-x-clip px-4 sm:px-5 lg:px-8">
        <EmptyState title={emptyTitle} message={emptyMessage} />
      </div>
    );
  }

  return (
    <div className="mt-4 w-full overflow-x-clip px-4 pb-8 sm:px-5 lg:px-8" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        <span className="font-bold text-slate-800">{posts.length} posts</span>
        <button type="button" onClick={refresh} className="font-bold text-sky-700">
          Refresh
        </button>
      </div>

      <div className="w-full max-w-full space-y-4 overflow-x-clip">
        {(posts || []).map((post) => (
          <FeedPost
            key={post.id}
            post={post}
            profile={profile}
            currentUserId={currentUserId}
            liked={(actionsByScope?.[post.feed_scope || "feed"]?.likedPosts || likedPosts)?.has?.(post.id)}
            saved={(actionsByScope?.[post.feed_scope || "feed"]?.savedPosts || savedPosts)?.has?.(post.id)}
            onLike={() => (actionsByScope?.[post.feed_scope || "feed"]?.onLike || onLike)?.(post.id)}
            onSave={() => (actionsByScope?.[post.feed_scope || "feed"]?.onSave || onSave)?.(post.id)}
            onCommentCountChange={(delta) => (actionsByScope?.[post.feed_scope || "feed"]?.onCommentCountChange || onCommentCountChange)?.(post.id, delta)}
            onEdit={(body) => (actionsByScope?.[post.feed_scope || "feed"]?.onEdit || onEdit)?.(post.id, body)}
            onDelete={() => (actionsByScope?.[post.feed_scope || "feed"]?.onDelete || onDelete)?.(post.id, { confirm: false })}
            onHide={() => (actionsByScope?.[post.feed_scope || "feed"]?.onHide || onHide)?.(post.id)}
            onReport={(reason) => (actionsByScope?.[post.feed_scope || "feed"]?.onReport || onReport)?.(post.id, reason)}
            onViewActivity={() => (actionsByScope?.[post.feed_scope || "feed"]?.onViewActivity || onViewActivity)?.(post.id)}
            onViewProfile={() =>
              onViewProfile?.({
                userId: post.user_id || "",
                displayName: post.author_name || "Profile",
                username: post.author_username || "",
                avatarUrl: post.author_avatar_url || "",
                accountType: "personal",
              })
            }
            followed={Boolean(post.user_id && followedUsers.has(post.user_id))}
            onFollow={() => handleFollow(post)}
            isOwner={Boolean(currentUserId && post.user_id === currentUserId)}
          />
        ))}
      </div>

      <p className="py-5 text-center text-sm font-bold text-slate-400">You are all caught up.</p>
    </div>
  );
}

function FeedListSkeleton() {
  return (
    <div className="mt-4 w-full overflow-x-clip px-4 pb-8 sm:px-5 lg:px-8">
      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <article key={item} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 animate-pulse rounded-full bg-slate-200" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 max-w-full animate-pulse rounded-full bg-slate-200" />
                <div className="h-3 w-24 animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
              <div className="h-3 w-4/5 animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="mt-4 h-40 animate-pulse rounded-[22px] bg-slate-100" />
          </article>
        ))}
      </div>
    </div>
  );
}
