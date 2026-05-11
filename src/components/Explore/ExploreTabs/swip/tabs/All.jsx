import { useEffect, useRef, useState } from "react";

import { useExploreFeed } from "../../../../../Backend/hooks/useExploreFeed";
import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import { stopAllExploreMedia } from "../../../shared/singleMediaPlayback";
import VideoCard from "../videos/VideoCard";
import { getSwipContext, getVideoCategoryLabel, getSwipVideos } from "../videos/swipUtils";

const SWIPE_THRESHOLD_PX = 70;
const SWIPE_LOCK_MS = 650;
const WHEEL_THRESHOLD_PX = 80;

export default function All({ currentUserId = "", onlyUserId = "", onViewProfile }) {
  const feed = useExploreFeed("swip");
  const videos = getSwipVideos(feed.posts, onlyUserId);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartYRef = useRef(null);
  const touchMovedRef = useRef(false);
  const swipeLockedRef = useRef(false);
  const swipeUnlockTimerRef = useRef(null);
  const wheelDeltaRef = useRef(0);

  useEffect(() => {
    setActiveIndex((current) => Math.min(Math.max(current, 0), Math.max(videos.length - 1, 0)));
  }, [videos.length]);

  useEffect(() => () => {
    window.clearTimeout(swipeUnlockTimerRef.current);
    stopAllExploreMedia();
  }, []);

  function lockSwipe() {
    swipeLockedRef.current = true;
    window.clearTimeout(swipeUnlockTimerRef.current);
    swipeUnlockTimerRef.current = window.setTimeout(() => {
      swipeLockedRef.current = false;
      wheelDeltaRef.current = 0;
    }, SWIPE_LOCK_MS);
  }

  function moveBy(direction) {
    if (swipeLockedRef.current || !direction) {
      return;
    }

    setActiveIndex((current) => {
      const next = Math.min(Math.max(current + direction, 0), videos.length - 1);
      if (next !== current) {
        stopAllExploreMedia();
      }
      return next;
    });
    lockSwipe();
  }

  function handleTouchStart(event) {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
    touchMovedRef.current = false;
  }

  function handleTouchMove(event) {
    if (touchStartYRef.current === null) {
      return;
    }

    touchMovedRef.current = true;
    event.preventDefault();
  }

  function handleTouchEnd(event) {
    const startY = touchStartYRef.current;
    touchStartYRef.current = null;

    if (startY === null || !touchMovedRef.current) {
      return;
    }

    const endY = event.changedTouches[0]?.clientY ?? startY;
    const distance = startY - endY;

    if (Math.abs(distance) < SWIPE_THRESHOLD_PX) {
      return;
    }

    moveBy(distance > 0 ? 1 : -1);
  }

  function handleWheel(event) {
    event.preventDefault();
    if (swipeLockedRef.current) {
      return;
    }

    wheelDeltaRef.current += event.deltaY;
    if (Math.abs(wheelDeltaRef.current) < WHEEL_THRESHOLD_PX) {
      return;
    }

    const direction = wheelDeltaRef.current > 0 ? 1 : -1;
    wheelDeltaRef.current = 0;
    moveBy(direction);
  }

  if (feed.error) {
    return (
      <div className="p-4">
        <ErrorState message={feed.error} onRetry={feed.reload} />
      </div>
    );
  }

  if (!videos.length) {
    return (
      <div className="p-4">
        <EmptyState
          title="No Swip videos yet"
          message="Videos you post from the composer will appear in Swip automatically."
        />
      </div>
    );
  }

  const activePost = videos[activeIndex] || videos[0];

  return (
    <div
      className="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-slate-950"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchStartYRef.current = null;
        touchMovedRef.current = false;
      }}
      onWheel={handleWheel}
      style={{ touchAction: "none", overscrollBehavior: "none" }}
    >
      {activePost ? (
        <VideoCard
          key={activePost.id}
          post={activePost}
          contextLabel={getSwipContext(activePost, currentUserId)}
          categoryLabel={getVideoCategoryLabel(activePost)}
          currentUserId={currentUserId}
          liked={feed.likedPosts.has(activePost.id)}
          saved={feed.savedPosts.has(activePost.id)}
          isOwner={Boolean(currentUserId && activePost.user_id === currentUserId)}
          onLike={() => feed.toggleLike(activePost.id)}
          onSave={() => feed.toggleSave(activePost.id)}
          onComment={(body) => feed.addComment(activePost.id, body)}
          onDelete={() => feed.deletePost(activePost.id)}
          onViewProfile={() =>
            onViewProfile?.({
              userId: activePost.user_id || "",
              displayName: activePost.author_name || "Profile",
              username: activePost.author_username || "",
              avatarUrl: activePost.author_avatar_url || "",
              accountType: "personal",
            })
          }
        />
      ) : null}
      <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-full bg-slate-950/45 px-3 py-1 text-xs font-black text-white backdrop-blur">
        {activeIndex + 1}/{videos.length}
      </div>
    </div>
  );
}
