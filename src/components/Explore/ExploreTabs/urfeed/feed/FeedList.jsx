import { useEffect, useMemo, useRef, useState } from "react";

import { createExploreNotification } from "../../../../../Backend/services/exploreService";
import { useExploreFollows } from "../../../../../Backend/hooks/useExploreFollows";
import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import FeedPost from "./components/FeedPost";
import FeedSkeleton from "./skeletons/FeedSkeleton";

const PAGE_SIZE = 8;

export default function FeedList({
  posts,
  loading,
  error,
  onRetry,
  likedPosts,
  savedPosts,
  onLike,
  onSave,
  onComment,
  onEdit,
  onDelete,
  onHide,
  onReport,
  onViewActivity,
  onViewProfile,
  currentUserId,
  emptyTitle = "No posts yet",
  emptyMessage = "The feed is empty right now. Be the first to share something.",
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartRef = useRef(null);
  const loaderRef = useRef(null);
  const { followedUsers, toggleFollow } = useExploreFollows(currentUserId);

  const visiblePosts = useMemo(() => (posts || []).slice(0, visibleCount), [posts, visibleCount]);
  const hasMore = visibleCount < (posts?.length || 0);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [posts?.length]);

  useEffect(() => {
    if (!loaderRef.current || !hasMore) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((current) => current + PAGE_SIZE);
        }
      },
      { rootMargin: "300px" },
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore]);

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
      await createExploreNotification({
        user_id: post.user_id,
        type: "follow",
        post_id: post.id,
        post_preview: post.body,
        media_type: "profile",
      });
      return "Following";
    }

    return active === false ? "Unfollowed" : "";
  }

  if (loading) {
    return <FeedSkeleton />;
  }

  if (error) {
    return (
      <div className="mt-4 w-full px-4 sm:px-5">
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (!posts?.length) {
    return (
      <div className="mt-4 w-full px-4 sm:px-5">
        <EmptyState title={emptyTitle} message={emptyMessage} />
      </div>
    );
  }

  return (
    <div className="mt-4 w-full px-4 pb-8 sm:px-5" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        <span className="font-bold text-slate-800">{refreshing ? "Refreshing..." : `${posts.length} posts`}</span>
        <button type="button" onClick={refresh} className="font-bold text-sky-700">
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {visiblePosts.map((post) => (
          <FeedPost
            key={post.id}
            post={post}
            currentUserId={currentUserId}
            liked={likedPosts?.has?.(post.id)}
            saved={savedPosts?.has?.(post.id)}
            onLike={() => onLike?.(post.id)}
            onSave={() => onSave?.(post.id)}
            onComment={(body) => onComment?.(post.id, body)}
            onEdit={() => onEdit?.(post.id)}
            onDelete={() => onDelete?.(post.id)}
            onHide={() => onHide?.(post.id)}
            onReport={() => onReport?.(post.id)}
            onViewActivity={() => onViewActivity?.(post.id)}
            onViewProfile={() =>
              onViewProfile?.({
                userId: post.user_id || "",
                displayName: post.author_name || "KunThai User",
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

      {hasMore ? (
        <div ref={loaderRef} className="py-5 text-center text-sm font-bold text-slate-400">
          Loading more posts...
        </div>
      ) : (
        <p className="py-5 text-center text-sm font-bold text-slate-400">You are all caught up.</p>
      )}
    </div>
  );
}
