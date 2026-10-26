import { Component, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Share2 } from "lucide-react";

import { useBrowserBack } from "../../../../../Backend/hooks/useBrowserBack";
import { useExploreFeed } from "../../../../../Backend/hooks/useExploreFeed";
import { shareKunThaiLink } from "../../../../../Backend/services/shareCtaService";
import { getPostIdentity } from "../../../../../Backend/services/exploreService";
import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import { useI18n, t as translate } from "../../../../../i18n";
import { stopAllExploreMedia } from "../../../shared/singleMediaPlayback";
import { readExploreSettings } from "../../../../../Backend/services/explore/preferencesService";
import VideoCard from "../videos/VideoCard";
import { getSwipContext, getVideoCategoryLabel, getSwipVideos, isRenderableSwipPost } from "../videos/swipUtils";
import { uiText as translateUi } from "../../../../../i18n/index.js";

const WHEEL_THRESHOLD_PX = 70;
const WHEEL_LOCK_MS = 720;

export default function All({ active = true, currentUserId = "", focusPostId = "", focusPost = null, focusRequest = null, onlyUserId = "", onReturnToRepost, onViewProfile, profile }) {
  const { t } = useI18n();
  const feed = useExploreFeed("swip");
  const feedVideos = getSwipVideos(feed.posts, onlyUserId).filter(isRenderableSwipPost);
  const focusedVideos = getSwipVideos(focusPost ? [focusPost] : [], onlyUserId).filter(isRenderableSwipPost);
  const videos = focusedVideos.length && !feedVideos.some((post) => post.id === focusedVideos[0].id)
    ? [focusedVideos[0], ...feedVideos]
    : feedVideos;
  const focusedVideoIndex = focusPostId ? videos.findIndex((post) => post.id === focusPostId) : -1;
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const scrollerRef = useRef(null);
  const itemRefs = useRef([]);
  const wheelLockedRef = useRef(false);
  const wheelUnlockTimerRef = useRef(null);
  const wheelDeltaRef = useRef(0);
  const scrollPlayTimerRef = useRef(null);
  const handledFocusKeyRef = useRef("");

  useEffect(() => {
    if (focusPost?.id) feed.includePost(focusPost);
    // focusRequest.key is the intentional insertion trigger; the feed hook
    // object changes as it stores the post and should not replay this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.key, focusPost]);

  useBrowserBack(fullscreen, () => setFullscreen(false), "swip-fullscreen");

  useEffect(() => {
    setActiveIndex((current) => Math.min(Math.max(current, 0), Math.max(videos.length - 1, 0)));
  }, [videos.length]);

  // Clips 3-5 ahead are not mounted; only their first ~1 MB is fetched, so
  // they start quickly when reached (the network and CDN already have the
  // start) without the memory cost of more video players.
  const warmUrls = active
    ? videos.slice(activeIndex + SWIP_PRELOAD_AHEAD + 1, activeIndex + SWIP_WARM_AHEAD + 1).map((post) => post.video_url).filter(Boolean)
    : [];
  const warmKey = warmUrls.join("|");
  useEffect(() => {
    if (!warmKey || swipBufferAhead() < SWIP_PRELOAD_AHEAD || readExploreSettings().video.reduceData) return undefined;
    const controller = new AbortController();
    (async () => {
      for (const url of warmKey.split("|")) {
        if (controller.signal.aborted) return;
        await warmSwipClip(url, controller.signal);
      }
    })();
    return () => controller.abort();
  }, [warmKey]);

  useEffect(() => {
    if (active && feed.hasMore && !feed.loadingMore && videos.length > 0 && activeIndex >= videos.length - 3) {
      feed.loadMore();
    }
    // The feed object is recreated by the hook; page position is the useful trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeIndex, videos.length, feed.hasMore, feed.loadingMore]);

  useEffect(() => {
    if (!active) {
      stopAllExploreMedia(null, { muteVideos: false });
    }
  }, [active]);

  useEffect(() => () => {
    window.clearTimeout(wheelUnlockTimerRef.current);
    window.clearTimeout(scrollPlayTimerRef.current);
    stopAllExploreMedia(null, { muteVideos: false });
  }, []);

  const dispatchSwipActivePlay = useCallback((sound = true) => {
    window.dispatchEvent(new CustomEvent("swip-active-play", { detail: { sound } }));
  }, []);

  const requestSwipActivePlay = useCallback((delay = 0, sound = true) => {
    window.clearTimeout(scrollPlayTimerRef.current);
    if (delay <= 0) {
      dispatchSwipActivePlay(sound);
      return;
    }

    scrollPlayTimerRef.current = window.setTimeout(() => {
      dispatchSwipActivePlay(sound);
    }, delay);
  }, [dispatchSwipActivePlay]);

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
            stopAllExploreMedia(null, { muteVideos: false });
            requestSwipActivePlay(0, true);
          }
          return nextIndex;
        });
      },
      // The clip coming in becomes current once it fills most of the screen,
      // so it starts playing as the swipe lands rather than after it settles.
      { root: scroller, threshold: [0.55, 0.75, 0.95] },
    );

    itemRefs.current.forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [requestSwipActivePlay, videos.length]);

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

    stopAllExploreMedia(null, { muteVideos: false });
    setActiveIndex(next);
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    requestSwipActivePlay(160, true);
  }

  useEffect(() => {
    if (!active || focusedVideoIndex < 0) return undefined;
    const requestKey = focusRequest?.key || "";
    if (requestKey && handledFocusKeyRef.current === requestKey) return undefined;
    const timer = window.setTimeout(() => {
      const node = itemRefs.current[focusedVideoIndex];
      if (!node) return;
      stopAllExploreMedia(null, { muteVideos: false });
      setActiveIndex(focusedVideoIndex);
      node.scrollIntoView({ behavior: requestKey ? "auto" : "smooth", block: "start" });
      if (requestKey) {
        handledFocusKeyRef.current = requestKey;
        const postNode = document.getElementById(`post-${focusPostId}`);
        postNode?.classList.remove("kt-notification-post-focus");
        if (postNode) void postNode.offsetWidth;
        postNode?.classList.add("kt-notification-post-focus");
        window.setTimeout(() => {
          node.scrollIntoView({ behavior: "auto", block: "start" });
          if (focusRequest?.openComments) {
            window.dispatchEvent(new CustomEvent("explore-open-post-comments", {
              detail: { postId: focusPostId, commentId: focusRequest.commentId || "" },
            }));
          }
        }, 120);
        window.setTimeout(() => postNode?.classList.remove("kt-notification-post-focus"), 2200);
      }
      requestSwipActivePlay(160, true);
    }, requestKey ? 420 : 80);
    return () => window.clearTimeout(timer);
  }, [active, focusPostId, focusRequest, focusedVideoIndex, requestSwipActivePlay]);

 function handleWheel(event) {
  if (event.cancelable) {
    event.preventDefault();
  }

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

  // A safety retry once scrolling stops (the card already starts playing
  // as soon as it becomes current).
  function handleScroll() {
    requestSwipActivePlay(60, true);
  }

  if (feed.error) {
    return (
      <div className="p-4">
        <ErrorState message={translateUi(feed.error)} onRetry={feed.reload} />
      </div>
    );
  }

  // No loading cards: the first page and clips are fetched at app start
  // (swipStartupPrefetch), so this is only ever a plain dark moment.
  if (feed.loading && !videos.length) {
    return <div className="h-full min-h-0 w-full bg-slate-950" />;
  }

  if (!videos.length) {
    return (
      <div className="p-4">
        <EmptyState
          title={t("swip.noVideosTitle")}
          message={t("swip.noVideosMsg")}
        />
        <div className="mx-auto mt-4 max-w-md rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-center shadow-sm">
          <p className="text-sm font-black text-slate-950">{t("swip.keepFunGoing")}</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{t("swip.keepFunGoingMsg")}</p>
          <button
            type="button"
            onClick={shareKunThaiLink}
            className="kt-pressable mx-auto mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
          >
            <Share2 size={16} />
            {t("swip.shareKunThai")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full bg-slate-950">
      {onReturnToRepost ? (
        <button
          type="button"
          onClick={onReturnToRepost}
          aria-label={t("swip.backToRepost")}
          className="kt-pressable absolute left-3 top-3 z-40 flex h-11 items-center gap-2 rounded-full border border-white/15 bg-slate-950/55 px-4 text-sm font-black text-white shadow-2xl backdrop-blur-xl"
        >
          <ArrowLeft size={19} />
          {t("swip.back")}
        </button>
      ) : null}
      <div
        ref={scrollerRef}
        className="relative h-full min-h-0 w-full min-w-0 snap-y snap-mandatory overflow-y-auto overflow-x-hidden bg-slate-950 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onScroll={handleScroll}
      onWheel={handleWheel}
      style={{
        "--swip-item-height": "calc(100dvh - var(--explore-top-chrome-height,57px))",
        touchAction: "pan-y",
        overscrollBehavior: "contain",
      }}
      >
      {videos.map((post, index) => {
  // The current clip, the one before and the next two stay mounted; the
  // current and upcoming ones buffer ahead so a swipe starts playing at once.
  const offset = index - activeIndex;
  const shouldMountVideo = offset >= -1 && offset <= SWIP_PRELOAD_AHEAD;
  const preloadMode = offset >= 0 && offset <= swipBufferAhead() ? "auto" : "metadata";
  // The clips right after this one are primed (first frames ready) so the
  // next swipe plays instantly, like the big apps.
  const prime = active && offset >= 1 && offset <= Math.min(swipBufferAhead(), 2);

  return (
    <section
      key={post.id}
      ref={(node) => {
        itemRefs.current[index] = node;
      }}
      data-swip-index={index}
      className="h-[var(--swip-item-height)] min-h-[var(--swip-item-height)] w-full snap-start snap-always"
    >
      {shouldMountVideo ? (
        <SwipPostBoundary postId={post.id}>
          <VideoCard
            profile={profile}
            post={post}
            active={active && index === activeIndex}
            preloadMode={preloadMode}
            prime={prime}
            fullBleed
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
            onMediaUnavailable={() => feed.dismissPostLocally(post.id)}
            onHide={() => feed.hidePost(post.id)}
            onMuteAdvertiser={() => feed.muteAdvertiser(post.id)}
            onReport={(reason) => feed.reportPost(post.id, reason)}
            onFullscreenToggle={() => setFullscreen((current) => !current)}
            onViewProfile={() =>
              onViewProfile?.({
                userId: post.user_id || "",
                ownerUserId: post.user_id || "",
                identityType: getPostIdentity(post).type,
                identityId: getPostIdentity(post).id,
                actorType: post.actor_type || "profile",
                actorId: post.actor_id || post.user_id || "",
                spaceId: post.space_id || (post.actor_type === "space" ? post.actor_id : ""),
                displayName: post.author_name || "Profile",
                username: post.author_username || "",
                avatarUrl: post.author_avatar_url || "",
                accountType: post.actor_type === "space" ? "space" : "personal",
              })
            }
          />
        </SwipPostBoundary>
      ) : (
        <div className="h-full w-full bg-slate-950" />
      )}
    </section>
  );
})}
      </div>
    </div>
  );
}

const SWIP_PRELOAD_AHEAD = 2;
const SWIP_WARM_AHEAD = 5;
const SWIP_WARM_BYTES = 1024 * 1024;
const warmedSwipClips = new Set();

// Fetches the first ~1 MB of a clip once per session. Best-effort: any
// failure is ignored and the clip simply loads normally when reached.
async function warmSwipClip(url, signal) {
  if (!url || warmedSwipClips.has(url) || typeof fetch !== "function") return;
  warmedSwipClips.add(url);
  try {
    const response = await fetch(url, {
      headers: { Range: `bytes=0-${SWIP_WARM_BYTES - 1}` },
      credentials: "omit",
      signal,
    });
    // Read up to 1 MB so it is actually downloaded (and cached), then stop,
    // even if the server ignored the range and sent the whole file.
    const reader = response.body?.getReader?.();
    if (!reader) return;
    let received = 0;
    while (received < SWIP_WARM_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value?.byteLength || 0;
    }
    reader.cancel().catch(() => {});
  } catch {
    // Aborted (the person scrolled on or left Swip) or offline: try again later.
    if (signal?.aborted) warmedSwipClips.delete(url);
  }
}

// How many upcoming clips may buffer fully. On a slow or data-saving
// connection only the current clip does, so it is not starved.
function swipBufferAhead() {
  const connection = typeof navigator !== "undefined"
    ? navigator.connection || navigator.mozConnection || navigator.webkitConnection
    : null;
  const effectiveType = String(connection?.effectiveType || "").toLowerCase();
  if (connection?.saveData || effectiveType === "slow-2g" || effectiveType === "2g") return 0;
  if (effectiveType === "3g") return 1;
  return SWIP_PRELOAD_AHEAD;
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
    if (import.meta.env.DEV) {
      console.error("[Swip] Video card failed", { postId: this.props.postId, error });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-950 p-6 text-center">
          <div className="max-w-xs rounded-2xl border border-white/10 bg-white/10 px-4 py-5 text-white shadow-xl backdrop-blur">
            <p className="text-sm font-black">{translate("swip.couldNotLoad")}</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-white/70">{translate("swip.couldNotLoadMsg")}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
