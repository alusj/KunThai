import { useEffect, useRef, useState } from "react";

import { useExploreFeed } from "../../../../../Backend/hooks/useExploreFeed";
import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import { stopAllExploreMedia } from "../../../shared/singleMediaPlayback";
import VideoCard from "../videos/VideoCard";
import { getSwipContext, getVideoCategoryLabel, getSwipVideos } from "../videos/swipUtils";

const WHEEL_THRESHOLD_PX = 70;
const WHEEL_LOCK_MS = 720;

export default function All({ currentUserId = "", onlyUserId = "", onViewProfile }) {
  const feed = useExploreFeed("swip");
  const videos = getSwipVideos(feed.posts, onlyUserId);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef(null);
  const itemRefs = useRef([]);
  const wheelLockedRef = useRef(false);
  const wheelUnlockTimerRef = useRef(null);
  const wheelDeltaRef = useRef(0);

  useEffect(() => {
    setActiveIndex((current) => Math.min(Math.max(current, 0), Math.max(videos.length - 1, 0)));
  }, [videos.length]);

  useEffect(() => () => {
    window.clearTimeout(wheelUnlockTimerRef.current);
    stopAllExploreMedia();
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const centered = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!centered) {
          return;
        }

        const nextIndex = Number(centered.target.getAttribute("data-swip-index") || 0);
        setActiveIndex((current) => {
          if (current !== nextIndex) {
            stopAllExploreMedia();
          }
          return nextIndex;
        });
      },
      { root: scroller, threshold: [0.72, 0.86, 0.98] },
    );

    itemRefs.current.forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [videos.length]);

  function lockWheel() {
    wheelLockedRef.current = true;
    window.clearTimeout(wheelUnlockTimerRef.current);
    wheelUnlockTimerRef.current = window.setTimeout(() => {
      wheelLockedRef.current = false;
      wheelDeltaRef.current = 0;
    }, WHEEL_LOCK_MS);
  }

  function scrollToIndex(index) {
    const next = Math.min(Math.max(index, 0), videos.length - 1);
    const node = itemRefs.current[next];
    if (!node) {
      return;
    }

    stopAllExploreMedia();
    setActiveIndex(next);
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleWheel(event) {
    event.preventDefault();
    if (wheelLockedRef.current) {
      return;
    }

    wheelDeltaRef.current += event.deltaY;
    if (Math.abs(wheelDeltaRef.current) < WHEEL_THRESHOLD_PX) {
      return;
    }

    const direction = wheelDeltaRef.current > 0 ? 1 : -1;
    wheelDeltaRef.current = 0;
    scrollToIndex(activeIndex + direction);
    lockWheel();
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

  return (
    <div
      ref={scrollerRef}
      className="relative h-full min-h-0 w-full min-w-0 snap-y snap-mandatory overflow-y-auto overflow-x-hidden bg-slate-950 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onWheel={handleWheel}
      style={{ touchAction: "pan-y", overscrollBehavior: "contain", scrollSnapStop: "always" }}
    >
      {videos.map((post, index) => (
        <section
          key={post.id}
          ref={(node) => {
            itemRefs.current[index] = node;
          }}
          data-swip-index={index}
          className="h-full min-h-full w-full snap-start snap-always"
        >
          <VideoCard
            post={post}
            active={index === activeIndex}
            contextLabel={getSwipContext(post, currentUserId)}
            categoryLabel={getVideoCategoryLabel(post)}
            currentUserId={currentUserId}
            liked={feed.likedPosts.has(post.id)}
            saved={feed.savedPosts.has(post.id)}
            isOwner={Boolean(currentUserId && post.user_id === currentUserId)}
            onLike={() => feed.toggleLike(post.id)}
            onSave={() => feed.toggleSave(post.id)}
            onComment={(body) => feed.addComment(post.id, body)}
            onDelete={() => feed.deletePost(post.id, { confirm: false })}
            onViewProfile={() =>
              onViewProfile?.({
                userId: post.user_id || "",
                displayName: post.author_name || "Profile",
                username: post.author_username || "",
                avatarUrl: post.author_avatar_url || "",
                accountType: "personal",
              })
            }
          />
        </section>
      ))}
      <div className="pointer-events-none fixed right-3 top-[calc(var(--explore-top-chrome-height,57px)+10px)] z-20 flex items-center gap-1 rounded-full border border-white/12 bg-slate-950/18 px-2.5 py-1 text-[11px] font-black text-white/90 backdrop-blur-md">
        <span>{activeIndex + 1}</span>
        <span className="text-white/40">/</span>
        <span className="text-white/65">{videos.length}</span>
      </div>
    </div>
  );
}
