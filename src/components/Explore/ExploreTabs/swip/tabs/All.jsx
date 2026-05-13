import { Component, useEffect, useRef, useState } from "react";

import { useBrowserBack } from "../../../../../Backend/hooks/useBrowserBack";
import { useExploreFeed } from "../../../../../Backend/hooks/useExploreFeed";
import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import { stopAllExploreMedia } from "../../../shared/singleMediaPlayback";
import VideoCard from "../videos/VideoCard";
import { getSwipContext, getVideoCategoryLabel, getSwipVideos, isRenderableSwipPost } from "../videos/swipUtils";

const WHEEL_THRESHOLD_PX = 70;
const WHEEL_LOCK_MS = 720;

export default function All({ currentUserId = "", onlyUserId = "", onViewProfile }) {
  const feed = useExploreFeed("swip");
  const videos = getSwipVideos(feed.posts, onlyUserId).filter(isRenderableSwipPost);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const scrollerRef = useRef(null);
  const itemRefs = useRef([]);
  const wheelLockedRef = useRef(false);
  const wheelUnlockTimerRef = useRef(null);
  const wheelDeltaRef = useRef(0);

  useBrowserBack(fullscreen, () => setFullscreen(false), "swip-fullscreen");

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

  if (feed.loading && !videos.length) {
    return <SwipSkeleton />;
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
      style={{
        "--swip-item-height": "calc(100dvh - var(--explore-top-chrome-height,57px))",
        touchAction: "pan-y",
        overscrollBehavior: "contain",
      }}
    >
      {videos.map((post, index) => (
        <section
          key={post.id}
          ref={(node) => {
            itemRefs.current[index] = node;
          }}
          data-swip-index={index}
          className="h-[var(--swip-item-height)] min-h-[var(--swip-item-height)] w-full snap-start snap-always"
        >
          <SwipPostBoundary postId={post.id}>
            <VideoCard
              post={post}
              active={index === activeIndex}
              fullscreen={fullscreen}
              contextLabel={getSwipContext(post, currentUserId)}
              categoryLabel={getVideoCategoryLabel(post)}
              currentUserId={currentUserId}
              liked={feed.likedPosts.has(post.id)}
              saved={feed.savedPosts.has(post.id)}
              isOwner={Boolean(currentUserId && post.user_id === currentUserId)}
              onLike={() => feed.toggleLike(post.id)}
              onSave={() => feed.toggleSave(post.id)}
              onComment={(delta) => feed.bumpCommentCount(post.id, delta)}
              onDelete={() => feed.deletePost(post.id, { confirm: false })}
              onFullscreenToggle={() => setFullscreen((current) => !current)}
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
          </SwipPostBoundary>
        </section>
      ))}
    </div>
  );
}

function SwipSkeleton() {
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-slate-950">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950" />
      <div className="absolute bottom-10 left-4 right-24 space-y-3">
        <div className="h-12 w-12 animate-pulse rounded-full bg-white/20" />
        <div className="h-5 w-48 animate-pulse rounded-full bg-white/20" />
        <div className="h-4 w-32 animate-pulse rounded-full bg-white/15" />
        <div className="h-4 w-56 animate-pulse rounded-full bg-white/15" />
      </div>
      <div className="absolute bottom-28 right-3 h-56 w-14 animate-pulse rounded-full bg-white/15" />
    </div>
  );
}

class SwipPostBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[Swip] Video card failed", { postId: this.props.postId, error });
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-950 p-6 text-center">
          <div className="max-w-xs rounded-2xl border border-white/10 bg-white/10 px-4 py-5 text-white shadow-xl backdrop-blur">
            <p className="text-sm font-black">This Swip could not load.</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-white/70">Keep scrolling while the video is prepared.</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
