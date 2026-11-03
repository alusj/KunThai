import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  // A post opened from a notification or a reaction (focusRequest) goes
  // first and Swip opens straight on it, instead of scrolling past the clips
  // before it. Until the post has arrived its place is a plain dark card.
  const pinnedKey = focusRequest?.key && focusPostId ? focusRequest.key : "";
  const pinnedVideo = pinnedKey
    ? focusedVideos.find((post) => post.id === focusPostId) || feedVideos.find((post) => post.id === focusPostId) || null
    : null;
  let videos = feedVideos;
  if (pinnedKey) {
    videos = [pinnedVideo || { id: `pending-${focusPostId}`, pending: true }, ...feedVideos.filter((post) => post.id !== focusPostId)];
  } else if (focusedVideos.length && !feedVideos.some((post) => post.id === focusedVideos[0].id)) {
    videos = [focusedVideos[0], ...feedVideos];
  }
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
  const glideRef = useRef(0);

  useEffect(() => {
    if (focusPost?.id) feed.includePost(focusPost);
    // focusRequest.key is the intentional insertion trigger; the feed hook
    // object changes as it stores the post and should not replay this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.key, focusPost]);

  useBrowserBack(fullscreen, () => setFullscreen(false), "swip-fullscreen");

  // Before the screen is drawn (and before Swip slides in), back to the top,
  // where the opened post now is: no smooth scroll, nothing passed on the way.
  useLayoutEffect(() => {
    if (!pinnedKey) return;
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.style.scrollBehavior = "auto";
      scroller.scrollTop = 0;
      scroller.style.scrollBehavior = "";
    }
    stopAllExploreMedia(null, { muteVideos: false });
    setActiveIndex(0);
  }, [pinnedKey]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(Math.max(current, 0), Math.max(videos.length - 1, 0)));
  }, [videos.length]);

  // Clips 2-3 ahead are not mounted; only their first ~1 MB is fetched, so
  // they start quickly when reached (the network and CDN already have the
  // start) without the memory cost of more video players. The current and
  // next clip get the connection first: warming waits SWIP_WARM_DELAY_MS.
  const warmUrls = active
    ? videos.slice(activeIndex + SWIP_PRELOAD_AHEAD + 1, activeIndex + SWIP_WARM_AHEAD + 1).map((post) => post.video_url).filter(Boolean)
    : [];
  const warmKey = warmUrls.join("|");
  useEffect(() => {
    if (!warmKey || swipBufferAhead() < SWIP_PRELOAD_AHEAD || readExploreSettings().video.reduceData) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      for (const url of warmKey.split("|")) {
        if (controller.signal.aborted) return;
        await warmSwipClip(url, controller.signal);
      }
    }, SWIP_WARM_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
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

  // Turns the header and tab blur off while Swip is open (see index.css).
  useEffect(() => {
    if (!active) return undefined;
    document.documentElement.setAttribute("data-kt-swip-open", "");
    return () => document.documentElement.removeAttribute("data-kt-swip-open");
  }, [active]);

  useEffect(() => () => {
    window.clearTimeout(wheelUnlockTimerRef.current);
    window.clearTimeout(scrollPlayTimerRef.current);
    window.cancelAnimationFrame(glideRef.current);
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

    // Each report holds only the cards that crossed a line, so a card sliding
    // out would win on its own: compare every card's latest share instead.
    const ratios = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0));
        let centered = null;
        let best = 0;
        ratios.forEach((ratio, target) => {
          if (ratio > best && target.isConnected) {
            best = ratio;
            centered = target;
          }
        });

        if (!centered || best < 0.55) {
          return;
        }

        const nextIndex = Number(centered.getAttribute("data-swip-index") || 0);
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
      // The lower lines mirror the upper ones, so the card going out reports
      // in the same moment as the card coming in.
      { root: scroller, threshold: [0, 0.05, 0.25, 0.45, 0.55, 0.75, 0.95] },
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
      // An opened post is already first and on screen (pinnedKey).
      if (!requestKey) node.scrollIntoView({ behavior: "smooth", block: "start" });
      if (requestKey) {
        handledFocusKeyRef.current = requestKey;
        const postNode = document.getElementById(`post-${focusPostId}`);
        postNode?.classList.remove("kt-notification-post-focus");
        if (postNode) void postNode.offsetWidth;
        postNode?.classList.add("kt-notification-post-focus");
        window.setTimeout(() => {
          if (focusRequest?.openComments) {
            window.dispatchEvent(new CustomEvent("explore-open-post-comments", {
              detail: { postId: focusPostId, commentId: focusRequest.commentId || "" },
            }));
          }
        }, 120);
        window.setTimeout(() => postNode?.classList.remove("kt-notification-post-focus"), 2200);
      }
      requestSwipActivePlay(160, true);
    }, requestKey ? 0 : 80);
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

  // Like TikTok and Reels, Swip moves the clips itself: the card follows the
  // finger and, on release, glides exactly one clip on (a clear flick or a
  // drag past half the screen) or back. The phone's own scrolling is held
  // off during the drag, because its fling kept going underneath and could
  // carry a hard swipe past a clip, and its snapping went back on swipes
  // that ended short of half the screen.
  const flickRef = useRef(null);
  const touchMoveRef = useRef(null);

  // A touch inside an expanded caption scrolls the caption, as before.
  function insideInnerScroll(target, scroller) {
    for (let node = target; node && node !== scroller; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return true;
    }
    return false;
  }

  function handleTouchStart(event) {
    const scroller = scrollerRef.current;
    if (event.touches.length !== 1 || !scroller || insideInnerScroll(event.target, scroller)) {
      flickRef.current = null;
      return;
    }
    // Shown as the finger lands, so the next clip's picture is back before
    // the drag brings it into view.
    markSwipMoving();
    const touch = event.touches[0];
    flickRef.current = { x: touch.clientX, y: touch.clientY, at: performance.now(), index: cardOnScreen(), dragging: false, dy: 0, dx: 0 };
  }

  touchMoveRef.current = (event) => {
    const start = flickRef.current;
    const scroller = scrollerRef.current;
    const touch = event.touches[0];
    if (!start || !scroller || !touch) return;
    if (event.touches.length > 1) {
      flickRef.current = null;
      if (start.dragging) glideToIndex(cardOnScreen());
      return;
    }
    start.dy = touch.clientY - start.y;
    start.dx = touch.clientX - start.x;
    if (!start.dragging) {
      if (Math.abs(start.dy) < SWIP_DRAG_SLOP_PX || Math.abs(start.dy) <= Math.abs(start.dx)) {
        if (Math.abs(start.dx) >= SWIP_DRAG_SLOP_PX) flickRef.current = null;
        // Held off from the first move, or the phone's scroll starts first.
        else if (event.cancelable && Math.abs(start.dy) > Math.abs(start.dx)) event.preventDefault();
        return;
      }
      // A finger that catches a gliding clip carries on from where it is.
      window.cancelAnimationFrame(glideRef.current);
      start.dragging = true;
      markSwipMoving();
      // The card picks up from where it is; the swipe still counts from
      // where the finger first went down.
      start.scrollTop = scroller.scrollTop + start.dy;
      scroller.style.scrollSnapType = "none";
      scroller.style.scrollBehavior = "auto";
      scroller.style.overflowY = "";
    }
    if (event.cancelable) event.preventDefault();
    scroller.scrollTop = start.scrollTop - start.dy;
  };

  const scrollerShown = !feed.error && !(feed.loading && !videos.length);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;
    // Not through React: its touch listeners are passive and cannot hold
    // the phone's scrolling off.
    const onMove = (event) => touchMoveRef.current?.(event);
    scroller.addEventListener("touchmove", onMove, { passive: false });
    return () => scroller.removeEventListener("touchmove", onMove);
  }, [scrollerShown]);

  // The card lined up with the top of Swip right now (activeIndex can run a
  // card ahead while the last glide settles).
  function cardOnScreen() {
    const scroller = scrollerRef.current;
    if (!scroller) return activeIndex;
    const top = scroller.getBoundingClientRect().top;
    let best = activeIndex;
    let bestGap = Infinity;
    itemRefs.current.forEach((node, index) => {
      if (!node) return;
      const gap = Math.abs(node.getBoundingClientRect().top - top);
      if (gap < bestGap) {
        bestGap = gap;
        best = index;
      }
    });
    return best;
  }

  function handleTouchEnd(event) {
    const start = flickRef.current;
    flickRef.current = null;
    const scroller = scrollerRef.current;
    if (!start?.dragging || !scroller) return;
    const lift = event.changedTouches?.[0];
    const dy = lift && event.type === "touchend" ? lift.clientY - start.y : start.dy;
    const speed = Math.abs(dy) / Math.max(1, performance.now() - start.at);
    const height = scroller.clientHeight || 1;
    const onward = Math.abs(dy) >= height / 2
      || (Math.abs(dy) >= SWIP_FLICK_MIN_PX && (Math.abs(dy) >= height * SWIP_FLICK_DISTANCE || speed >= SWIP_FLICK_SPEED));
    const target = onward
      ? Math.min(Math.max(start.index + (dy < 0 ? 1 : -1), 0), videos.length - 1)
      : start.index;
    glideToIndex(target);
  }

  // The clip glides into place on its own (the phone's scrolling is off
  // meanwhile), so a hard fling still moves exactly one clip.
  function glideToIndex(index) {
    const scroller = scrollerRef.current;
    const node = itemRefs.current[index];
    if (!scroller || !node) return;
    window.cancelAnimationFrame(glideRef.current);
    markSwipMoving();
    scroller.style.overflowY = "hidden";
    scroller.style.scrollSnapType = "none";
    // Each frame's position must apply at once: a smooth scroll per frame
    // lags behind and leaves the card short.
    scroller.style.scrollBehavior = "auto";
    const from = scroller.scrollTop;
    // Where the card snaps: its top against the top of the scroller.
    const to = from + node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const startedAt = performance.now();
    if (index !== activeIndex) {
      stopAllExploreMedia(null, { muteVideos: false });
      setActiveIndex(index);
      requestSwipActivePlay(0, true);
    }
    const step = (now) => {
      const progress = Math.min(1, (now - startedAt) / SWIP_GLIDE_MS);
      const eased = 1 - (1 - progress) ** 3;
      scroller.scrollTop = from + (to - from) * eased;
      if (progress < 1) {
        glideRef.current = window.requestAnimationFrame(step);
        return;
      }
      scroller.style.overflowY = "";
      scroller.style.scrollSnapType = "";
      scroller.style.scrollBehavior = "";
    };
    glideRef.current = window.requestAnimationFrame(step);
  }

  // A safety retry once scrolling stops (the card already starts playing
  // as soon as it becomes current).
  function handleScroll() {
    markSwipMoving();
    requestSwipActivePlay(60, true);
  }

  // At rest only the current clip's player is shown: on Android, two video
  // players on screen together (even one just below the edge) made the
  // WebView redraw every frame, about 90 a second while nothing moved,
  // which kept the phone busy and warm. The others stay loaded underneath
  // and show again the moment Swip moves.
  const stillTimerRef = useRef(null);
  function markSwipMoving() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (scroller.classList.contains("kt-swip-still")) {
      scroller.classList.remove("kt-swip-still");
      // A paused player that was hidden shows black until it draws a frame
      // again: a seek to where it already is (buffered, so instant) does it.
      scroller.querySelectorAll('video[data-explore-active="false"]').forEach((video) => {
        if (!video.paused || video.readyState < 2 || video.seeking) return;
        const at = video.currentTime;
        video.currentTime = at;
      });
    }
    window.clearTimeout(stillTimerRef.current);
    const settle = () => {
      if (flickRef.current?.dragging) {
        stillTimerRef.current = window.setTimeout(settle, SWIP_STILL_MS);
        return;
      }
      scroller.classList.add("kt-swip-still");
    };
    stillTimerRef.current = window.setTimeout(settle, SWIP_STILL_MS);
  }
  useEffect(() => () => window.clearTimeout(stillTimerRef.current), []);

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
        className="kt-swip-still relative h-full min-h-0 w-full min-w-0 snap-y snap-mandatory overflow-y-auto overflow-x-hidden bg-slate-950 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onScroll={handleScroll}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{
        "--swip-item-height": "calc(100dvh - var(--explore-top-chrome-height,57px))",
        touchAction: "pan-y",
        overscrollBehavior: "contain",
      }}
      >
      {videos.map((post, index) => {
  // Three players at most: the clip before (paused), the current one and the
  // next one, which buffers and is primed (first frame ready) so a swipe
  // lands on a clip that plays at once. Four, plus players dropped without
  // being released, held up to 17 hardware decoders on a Galaxy A06 and
  // Android closed KunThai.
  const offset = index - activeIndex;
  const shouldMountVideo = offset >= -1 && offset <= SWIP_PRELOAD_AHEAD;
  const preloadMode = offset >= 0 && offset <= swipBufferAhead() ? "auto" : "metadata";
  const prime = active && offset === 1 && swipBufferAhead() >= 1;

  return (
    <section
      key={post.id}
      ref={(node) => {
        itemRefs.current[index] = node;
      }}
      data-swip-index={index}
      className="h-[var(--swip-item-height)] min-h-[var(--swip-item-height)] w-full snap-start snap-always"
    >
      {shouldMountVideo && !post.pending ? (
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

const SWIP_PRELOAD_AHEAD = 1;
const SWIP_WARM_AHEAD = 3;
const SWIP_WARM_DELAY_MS = 1200;
// A swipe moves one clip once it travels this far and is either this share
// of the screen or this fast (px per ms).
const SWIP_FLICK_MIN_PX = 40;
const SWIP_FLICK_DISTANCE = 0.18;
const SWIP_FLICK_SPEED = 0.35;
const SWIP_GLIDE_MS = 240;
// Quiet time after the last movement before the other clips are hidden.
const SWIP_STILL_MS = 300;
// Movement before a touch counts as a drag (below it, a tap).
const SWIP_DRAG_SLOP_PX = 8;
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
