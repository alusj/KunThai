import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Heart, MessageCircle, Play } from "lucide-react";

import { useBrowserBack } from "../../../../Backend/hooks/useBrowserBack";
import { readExploreSettings } from "../../../../Backend/services/explore/preferencesService";
import { fetchVideoViewCounts } from "../../../../Backend/services/explore/postAnalyticsService";
import AppPortal from "../../../shared/AppPortal";
import useBodyScrollLock from "../../../shared/useBodyScrollLock";
import { stopAllExploreMedia } from "../../shared/singleMediaPlayback";
import VideoCard from "../../ExploreTabs/swip/videos/VideoCard";
import { useI18n } from "../../../../i18n";

function compactCount(value) {
  const number = Number(value || 0);
  try {
    return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(number);
  } catch {
    return String(number);
  }
}

/**
 * A profile's Swip videos as a TikTok-style grid: three across on phones,
 * four on wider screens, each a 9:16 tile showing the video's first frame and
 * its likes. Tapping a tile opens the full-screen player on that video; swipe
 * up/down there moves through this profile's videos.
 */
export default function ProfileSwipGrid({ posts = [], feed, currentUserId = "", isOwner = false }) {
  const [openIndex, setOpenIndex] = useState(-1);
  // Views come from one batched call; until it answers (or if it can't),
  // tiles just leave the view number out.
  const [viewCounts, setViewCounts] = useState(null);
  const postIdsKey = posts.map((post) => post.id).join(",");

  useEffect(() => {
    let alive = true;
    fetchVideoViewCounts(postIdsKey ? postIdsKey.split(",") : [])
      .then((counts) => {
        if (alive) setViewCounts(counts);
      })
      .catch(() => {
        if (alive) setViewCounts(null);
      });
    return () => {
      alive = false;
    };
  }, [postIdsKey]);
  // Save data: tiles show a plain play icon instead of fetching video frames.
  const reduceData = Boolean(readExploreSettings().video?.reduceData);

  return (
    <>
      <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-[20px] sm:grid-cols-4">
        {posts.map((post, index) => (
          <button
            key={post.id}
            type="button"
            onClick={() => setOpenIndex(index)}
            className="kt-pressable relative aspect-[9/16] w-full overflow-hidden bg-slate-900"
            aria-label={post.body ? String(post.body).slice(0, 80) : "Swip"}
          >
            {!reduceData ? (
              // "#t=0.1" makes mobile browsers paint the first frame as a poster
              // while only the metadata range is fetched.
              <video
                src={`${post.video_url}#t=${(Number(post.video_trim_start) || 0) + 0.1}`}
                muted
                playsInline
                preload="metadata"
                tabIndex={-1}
                className="pointer-events-none h-full w-full object-cover"
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-white/70">
                <Play size={26} fill="currentColor" />
              </span>
            )}
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-950/85 to-transparent" />
            {/* Likes bottom-left, comments bottom-centre, views bottom-right. */}
            <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1 text-[10px] font-black text-white drop-shadow sm:text-[11px]">
              <span className="flex items-center gap-0.5">
                <Heart size={11} fill="currentColor" className="flex-none" /> {compactCount(post.likes_count)}
              </span>
              <span className="flex items-center gap-0.5">
                <MessageCircle size={11} fill="currentColor" className="flex-none" /> {compactCount(post.comments_count)}
              </span>
              <span className="flex min-w-[1.25rem] items-center justify-end gap-0.5">
                {viewCounts?.has(post.id) ? (
                  <>
                    <Play size={11} fill="currentColor" className="flex-none" /> {compactCount(viewCounts.get(post.id))}
                  </>
                ) : null}
              </span>
            </span>
          </button>
        ))}
      </div>

      {openIndex >= 0 ? (
        <ProfileSwipViewer
          posts={posts}
          startIndex={openIndex}
          feed={feed}
          currentUserId={currentUserId}
          isOwner={isOwner}
          onClose={() => setOpenIndex(-1)}
        />
      ) : null}
    </>
  );
}

function ProfileSwipViewer({ posts, startIndex, feed, currentUserId, isOwner, onClose }) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const scrollerRef = useRef(null);
  const itemRefs = useRef([]);
  const playTimerRef = useRef(null);

  useBodyScrollLock(true);

  const close = useCallback(() => {
    stopAllExploreMedia(null, { muteVideos: false });
    onClose();
  }, [onClose]);
  // The phone's back button closes the player, not the profile.
  const goBack = useBrowserBack(true, close, "profile-swip-viewer");

  const requestPlay = useCallback((delay = 120) => {
    window.clearTimeout(playTimerRef.current);
    playTimerRef.current = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("swip-active-play", { detail: { sound: true } }));
    }, delay);
  }, []);

  // Open on the tapped video.
  useEffect(() => {
    itemRefs.current[startIndex]?.scrollIntoView({ behavior: "auto", block: "start" });
    requestPlay(160);
    return () => {
      window.clearTimeout(playTimerRef.current);
      stopAllExploreMedia(null, { muteVideos: false });
    };
    // Runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The video filling the screen is the one that plays.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const centered = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!centered) return;
        const next = Number(centered.target.getAttribute("data-profile-swip-index") || 0);
        setActiveIndex((current) => {
          if (current !== next) {
            stopAllExploreMedia(null, { muteVideos: false });
            requestPlay(80);
          }
          return next;
        });
      },
      { root: scroller, threshold: [0.72, 0.86, 0.98] },
    );
    itemRefs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, [posts.length, requestPlay]);

  return (
    <AppPortal>
      <div className="fixed inset-0 z-[1300] bg-slate-950" role="dialog" aria-modal="true">
        <button
          type="button"
          onClick={() => goBack()}
          aria-label={t("common.back")}
          className="kt-pressable absolute left-3 top-[calc(var(--kt-safe-area-top,0px)+0.75rem)] z-40 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-slate-950/55 text-white shadow-2xl backdrop-blur-xl"
        >
          <ArrowLeft size={20} />
        </button>
        <div
          ref={scrollerRef}
          className="h-full w-full snap-y snap-mandatory overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ touchAction: "pan-y", overscrollBehavior: "contain" }}
        >
          {posts.map((post, index) => (
            <section
              key={post.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              data-profile-swip-index={index}
              className="h-[100dvh] w-full snap-start snap-always"
            >
              {Math.abs(index - activeIndex) <= 1 ? (
                <VideoCard
                  post={post}
                  active={index === activeIndex}
                  fullBleed
                  currentUserId={currentUserId}
                  isOwner={isOwner}
                  liked={feed.likedPosts.has(post.id)}
                  saved={feed.savedPosts.has(post.id)}
                  onLike={() => feed.toggleLike(post.id)}
                  onSave={() => feed.toggleSave(post.id)}
                  onComment={(delta) => feed.bumpCommentCount(post.id, delta)}
                  onDelete={() => {
                    feed.deletePost(post.id, { confirm: false });
                    if (posts.length <= 1) close();
                  }}
                />
              ) : (
                <div className="h-full w-full bg-slate-950" />
              )}
            </section>
          ))}
        </div>
      </div>
    </AppPortal>
  );
}
