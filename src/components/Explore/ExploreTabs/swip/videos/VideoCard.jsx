import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Eye, EyeOff, Flag, Heart, Link, Repeat2, Send, Trash2, X } from "lucide-react";

import { useBrowserBack } from "../../../../../Backend/hooks/useBrowserBack";
import { createExploreNotification, recordRecommendationSignal } from "../../../../../Backend/services/exploreService";
import CommentsDrawer from "../../urfeed/feed/comments/CommentsDrawer";
import { copyPostLink, sharePost } from "../../urfeed/feed/post/postUtils";
import { pauseOtherExploreMedia, playExploreMedia, stopAllExploreMedia } from "../../../shared/singleMediaPlayback";
import ExploreActionDrawer from "../../../shared/ExploreActionDrawer";
import RepostComposer from "../../../shared/RepostComposer";
import SwipActionRail from "./SwipActionRail";
import SwipCaption from "./SwipCaption";
import VideoProgress from "./VideoProgress";

const MAX_SWIP_SECONDS = 15;

function logSwipPlayback(event, detail = {}) {
  if (import.meta.env.DEV) {
    console.info(`[Swip] ${event}`, detail);
  }
}

function getClipWindow(post, realDuration = 0) {
  const rawStart =
    post?.video_trim_start ??
    post?.videoTrimStart ??
    post?.media_meta?.videoTrimStart ??
    post?.mediaMeta?.videoTrimStart ??
    0;

  const rawEnd =
    post?.video_trim_end ??
    post?.videoTrimEnd ??
    post?.media_meta?.videoTrimEnd ??
    post?.mediaMeta?.videoTrimEnd ??
    null;

  const videoDuration = Number.isFinite(realDuration) && realDuration > 0 ? realDuration : 0;
  const start = Math.max(0, Math.min(Number(rawStart || 0), Math.max(0, videoDuration - 0.25)));
  const requestedEnd = rawEnd == null ? start + MAX_SWIP_SECONDS : Number(rawEnd);
  const maxEnd = videoDuration > 0 ? videoDuration : start + MAX_SWIP_SECONDS;
  const end = Math.min(maxEnd, Math.max(start + 0.5, requestedEnd), start + MAX_SWIP_SECONDS);

  return { start, end, duration: Math.max(0.5, end - start) };
}

export default function VideoCard({
  post,
  active = true,
  categoryLabel = "",
  contextLabel = "",
  currentUserId = "",
  fullBleed = false,
  fullscreen = false,
  liked,
  saved,
  isOwner,
  onLike,
  onSave,
  onComment,
  onDelete,
  onMediaUnavailable,
  onReport,
  onFullscreenToggle,
  onViewProfile,
  profile,
}) {
  const [commentOpen, setCommentOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [progress, setProgress] = useState({ currentTime: 0, duration: MAX_SWIP_SECONDS });
  const [message, setMessage] = useState("");
  const [needsSoundUnlock, setNeedsSoundUnlock] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [actionMenuClosing, setActionMenuClosing] = useState(false);
  const [quickDeckOpen, setQuickDeckOpen] = useState(false);
  const [quickDeckClosing, setQuickDeckClosing] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [displayMinimal, setDisplayMinimal] = useState(false);
  const [likeBurst, setLikeBurst] = useState(false);

  const videoRef = useRef(null);
  const holdTimerRef = useRef(null);
  const tapTimerRef = useRef(null);
  const lastTapAtRef = useRef(0);
  const likeBurstTimerRef = useRef(null);
  const actionMenuTimerRef = useRef(null);
  const quickDeckTimerRef = useRef(null);
  const holdTriggeredRef = useRef(false);
  const activeRef = useRef(false);
  const playbackSignalRef = useRef({
    started: false,
    viewed: false,
    completionSent: false,
    watchedSeconds: 0,
    maxCompletionRate: 0,
    lastMediaTime: null,
  });
  const trackingPostRef = useRef(post);
  const trackingClipDurationRef = useRef(MAX_SWIP_SECONDS);
  const videoFitClass = fullBleed || fullscreen ? "object-cover" : "object-contain";

  const clip = useMemo(() => getClipWindow(post, progress.realDuration || 0), [post, progress.realDuration]);
  trackingPostRef.current = post;
  trackingClipDurationRef.current = clip.duration;

  useBrowserBack(commentOpen, () => setCommentOpen(false), `swip-comments-${post.id}`);
  useBrowserBack(actionMenuOpen, closeActionMenu, `swip-actions-${post.id}`);
  useBrowserBack(quickDeckOpen, closeQuickDeck, `swip-quick-tools-${post.id}`);

  const startPlaybackSignals = useCallback(() => {
    const tracking = playbackSignalRef.current;
    if (tracking.started) return;

    playbackSignalRef.current = {
      started: true,
      viewed: false,
      completionSent: false,
      watchedSeconds: 0,
      maxCompletionRate: 0,
      lastMediaTime: null,
    };
    recordRecommendationSignal(trackingPostRef.current, "impression", { surface: "swip" }).catch(() => false);
  }, []);

  const markPlaybackViewed = useCallback(() => {
    const tracking = playbackSignalRef.current;
    if (!tracking.started || tracking.viewed) return;
    tracking.viewed = true;
    recordRecommendationSignal(trackingPostRef.current, "view", { surface: "swip" }).catch(() => false);
  }, []);

  const trackPlaybackProgress = useCallback((video, nextClip) => {
    const tracking = playbackSignalRef.current;
    if (!tracking.started || !activeRef.current) return;

    const relativeTime = Math.max(0, video.currentTime - nextClip.start);
    const previousTime = tracking.lastMediaTime;
    if (Number.isFinite(previousTime) && relativeTime >= previousTime) {
      const delta = relativeTime - previousTime;
      if (delta <= 2) tracking.watchedSeconds += delta;
    }
    tracking.lastMediaTime = relativeTime;
    tracking.maxCompletionRate = Math.max(
      tracking.maxCompletionRate,
      Math.min(1, relativeTime / Math.max(nextClip.duration, 0.5)),
    );
  }, []);

  const markPlaybackLoopCompleted = useCallback(() => {
    const tracking = playbackSignalRef.current;
    if (!tracking.started) return;

    tracking.maxCompletionRate = 1;
    tracking.lastMediaTime = 0;
    if (!tracking.completionSent) {
      tracking.completionSent = true;
      recordRecommendationSignal(trackingPostRef.current, "complete", {
        completionRate: 1,
        surface: "swip",
      }).catch(() => false);
      return;
    }

    recordRecommendationSignal(trackingPostRef.current, "rewatch", {
      completionRate: 1,
      surface: "swip",
    }).catch(() => false);
  }, []);

  const flushPlaybackSignals = useCallback(() => {
    const tracking = playbackSignalRef.current;
    if (!tracking.started) return;

    tracking.started = false;
    if (tracking.watchedSeconds >= 0.2) {
      recordRecommendationSignal(trackingPostRef.current, "watch", {
        value: Math.min(60, tracking.watchedSeconds),
        completionRate: tracking.maxCompletionRate,
        surface: "swip",
      }).catch(() => false);
    }

    const skipThreshold = Math.max(1.5, trackingClipDurationRef.current * 0.2);
    if (!tracking.completionSent && tracking.watchedSeconds < skipThreshold) {
      recordRecommendationSignal(trackingPostRef.current, "skip", {
        completionRate: tracking.maxCompletionRate,
        surface: "swip",
      }).catch(() => false);
    }
  }, []);

  const pauseInactiveVideo = useCallback((video) => {
    video.pause();
    video.muted = false;
    video.volume = 1;
    video.currentTime = clip.start;
    setProgress((current) => ({
      ...current,
      currentTime: 0,
      duration: MAX_SWIP_SECONDS,
    }));
  }, [clip.start]);

  const requestActivePlayback = useCallback(async ({ sound = true } = {}) => {
    if (!activeRef.current) return;

    const video = videoRef.current;
    if (!video) return;

    if (video.currentTime < clip.start || video.currentTime >= clip.end) {
      video.currentTime = clip.start;
    }

    // First choice: autoplay with sound. Some iOS/Safari builds block this
    // until a user gesture, so the fallback keeps the video moving silently
    // without showing a large "Tap for sound" overlay.
    video.muted = false;
    video.volume = sound ? 1 : 0;
    video.autoplay = true;

    try {
      await playExploreMedia(video, { muteVideos: false });
      video.muted = false;
      video.volume = sound ? 1 : 0;
      setNeedsSoundUnlock(false);
      logSwipPlayback("active video playing with sound", { post_id: post.id });
    } catch (error) {
      logSwipPlayback("unmuted autoplay deferred by browser", { post_id: post.id, error });

      try {
        video.muted = true;
        video.volume = 0;
        await video.play();
        setNeedsSoundUnlock(true);
      } catch (fallbackError) {
        setNeedsSoundUnlock(true);
        logSwipPlayback("muted autoplay deferred by browser", { post_id: post.id, error: fallbackError });
      }
    }
  }, [clip.end, clip.start, post.id]);

  useEffect(() => {
    function handleOpenPostComments(event) {
      if (String(event.detail?.postId || "") !== String(post.id)) return;
      setCommentOpen(true);
    }

    window.addEventListener("explore-open-post-comments", handleOpenPostComments);
    return () => window.removeEventListener("explore-open-post-comments", handleOpenPostComments);
  }, [post.id]);

  useEffect(() => {
    setMediaError("");
    setNeedsSoundUnlock(false);
    setVideoLoading(true);
    setActionMenuOpen(false);
    setActionMenuClosing(false);
    setQuickDeckOpen(false);
    setQuickDeckClosing(false);
    setRepostOpen(false);
    setDisplayMinimal(false);
    setProgress({ currentTime: 0, duration: MAX_SWIP_SECONDS, realDuration: 0 });
  }, [post.video_url]);

  useEffect(
    () => () => {
      window.clearTimeout(holdTimerRef.current);
      window.clearTimeout(tapTimerRef.current);
      window.clearTimeout(likeBurstTimerRef.current);
      window.clearTimeout(actionMenuTimerRef.current);
      window.clearTimeout(quickDeckTimerRef.current);
      flushPlaybackSignals();
      stopAllExploreMedia(null, { muteVideos: false });
    },
    [flushPlaybackSignals]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    activeRef.current = active;

    if (active) {
      startPlaybackSignals();
      video.currentTime = clip.start;
      requestActivePlayback();
      return;
    }

    flushPlaybackSignals();
    pauseInactiveVideo(video);
  }, [active, post.video_url, clip.start, flushPlaybackSignals, pauseInactiveVideo, requestActivePlayback, startPlaybackSignals]);

  useEffect(() => {
  if (!active) return undefined;

  function handleSwipActivePlay(event) {
    requestActivePlayback({ sound: event.detail?.sound !== false });
  }

  window.addEventListener("swip-active-play", handleSwipActivePlay);
  return () => window.removeEventListener("swip-active-play", handleSwipActivePlay);
}, [active, post.video_url, clip.start, requestActivePlayback]);

  async function handleShare() {
    const nextMessage = await sharePost(post);
    recordRecommendationSignal(post, "share", { surface: "swip" }).catch(() => false);
    if (post.user_id && post.user_id !== currentUserId) {
      await createExploreNotification({
        user_id: post.user_id,
        type: "share",
        post_id: post.id,
        post_preview: post.body,
        media_type: "Swip video",
      }).catch(() => null);
    }
    closeActionMenu();
    closeQuickDeck();
    setMessage(nextMessage);
  }

  async function handleCopyLink() {
    const nextMessage = await copyPostLink(post.id);
    closeActionMenu();
    closeQuickDeck();
    setMessage(nextMessage);
  }

  async function handleCopyCaption() {
    const caption = String(post.body || "").trim();
    if (!caption) {
      setMessage("No caption to copy.");
      closeActionMenu();
      return;
    }

    try {
      await navigator.clipboard.writeText(caption);
      setMessage("Caption copied.");
    } catch {
      setMessage(caption);
    }
    closeActionMenu();
    closeQuickDeck();
  }

  function handleDownload() {
    if (!post.video_url) {
      setMessage("Video is not ready for saving.");
      return;
    }

    const link = document.createElement("a");
    link.href = post.video_url;
    link.download = `kunthai-swip-${post.id}.mp4`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    closeActionMenu();
    closeQuickDeck();
    setMessage("Save started.");
  }

  function handleRepost() {
    closeActionMenu();
    closeQuickDeck();
    setRepostOpen(true);
  }

  async function handleReport() {
    if (isOwner) {
      setMessage("This is your Swip.");
      closeActionMenu();
      closeQuickDeck();
      return;
    }

    await onReport?.("Swip video report");
    closeActionMenu();
    closeQuickDeck();
    setMessage("Report received.");
  }

  function toggleDisplayMinimal() {
    setDisplayMinimal((current) => !current);
    closeActionMenu();
    closeQuickDeck();
  }

  function openDeleteFromActions() {
    closeActionMenu();
    closeQuickDeck();
    setDeleteOpen(true);
  }

  function closeActionMenu(afterClose) {
    if (!actionMenuOpen || actionMenuClosing) return;
    setActionMenuClosing(true);
    window.clearTimeout(actionMenuTimerRef.current);
    actionMenuTimerRef.current = window.setTimeout(() => {
      setActionMenuOpen(false);
      setActionMenuClosing(false);
      afterClose?.();
    }, 280);
  }

  function closeQuickDeck(afterClose) {
    if (!quickDeckOpen || quickDeckClosing) return;
    setQuickDeckClosing(true);
    window.clearTimeout(quickDeckTimerRef.current);
    quickDeckTimerRef.current = window.setTimeout(() => {
      setQuickDeckOpen(false);
      setQuickDeckClosing(false);
      afterClose?.();
    }, 280);
  }

  async function confirmDelete() {
    try {
      setDeleting(true);
      const deleted = await onDelete?.();
      if (deleted === false) {
        setMessage("Unable to delete video.");
        return;
      }
      setDeleteOpen(false);
    } catch (error) {
      setMessage(error.message || "Unable to delete video.");
    } finally {
      setDeleting(false);
    }
  }

  function updateVideoProgress(video) {
    if (!video) return;

    const realDuration = Number.isFinite(video.duration) ? video.duration : 0;
    const nextClip = getClipWindow(post, realDuration);

    if (video.currentTime < nextClip.start || video.currentTime >= nextClip.end) {
      video.currentTime = nextClip.start;
    }

    setProgress({
      currentTime: Math.max(0, video.currentTime - nextClip.start),
      duration: nextClip.duration,
      realDuration,
    });
  }

  function handleTimeUpdate(event) {
    const video = event.currentTarget;
    const realDuration = Number.isFinite(video.duration) ? video.duration : 0;
    const nextClip = getClipWindow(post, realDuration);
    trackPlaybackProgress(video, nextClip);

    if (video.currentTime >= nextClip.end) {
      markPlaybackLoopCompleted();
      video.currentTime = nextClip.start;
      video.play().catch(() => {});
      setProgress({ currentTime: 0, duration: nextClip.duration, realDuration });
      return;
    }

    if (video.currentTime < nextClip.start) {
      video.currentTime = nextClip.start;
      setProgress({ currentTime: 0, duration: nextClip.duration, realDuration });
      return;
    }

    setProgress({
      currentTime: Math.max(0, video.currentTime - nextClip.start),
      duration: nextClip.duration,
      realDuration,
    });
  }

  function handleSeek(nextTime) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(nextTime)) return;

    const realDuration = Number.isFinite(video.duration) ? video.duration : 0;
    const nextClip = getClipWindow(post, realDuration);
    const clampedRelative = Math.min(Math.max(nextTime, 0), nextClip.duration);

    video.currentTime = nextClip.start + clampedRelative;
    playbackSignalRef.current.lastMediaTime = clampedRelative;

    setProgress({
      currentTime: clampedRelative,
      duration: nextClip.duration,
      realDuration,
    });
  }

  function shouldIgnoreVideoGesture(event) {
    return Boolean(event.target.closest("button, a, input, textarea, [role='button']"));
  }

  function handleVideoTap() {
    if (!activeRef.current) return;

    const video = videoRef.current;
    if (!video) return;

    if (needsSoundUnlock || video.muted || video.volume === 0) {
      video.muted = false;
      video.volume = 1;
      setNeedsSoundUnlock(false);
      video.play().catch(() => setNeedsSoundUnlock(true));
      return;
    }

    if (video.paused) {
      requestActivePlayback({ sound: true });
      return;
    }

    video.pause();
  }

  function triggerDoubleTapLike() {
    window.clearTimeout(tapTimerRef.current);
    lastTapAtRef.current = 0;
    setActionMenuOpen(false);
    setActionMenuClosing(false);
    setQuickDeckOpen(false);
    setQuickDeckClosing(false);
    setLikeBurst(true);
    window.clearTimeout(likeBurstTimerRef.current);
    likeBurstTimerRef.current = window.setTimeout(() => setLikeBurst(false), 620);

    if (!liked) {
      onLike?.();
    }
  }

  function handleVideoSurfaceClick(event) {
    if (holdTriggeredRef.current) {
      holdTriggeredRef.current = false;
      return;
    }
    if (shouldIgnoreVideoGesture(event)) return;

    const now = Date.now();
    if (now - lastTapAtRef.current < 280) {
      triggerDoubleTapLike();
      return;
    }

    lastTapAtRef.current = now;
    window.clearTimeout(tapTimerRef.current);
    tapTimerRef.current = window.setTimeout(() => {
      lastTapAtRef.current = 0;
      handleVideoTap();
    }, 240);
  }

  function handlePointerDown(event) {
    if (shouldIgnoreVideoGesture(event)) return;
    window.clearTimeout(holdTimerRef.current);
    holdTriggeredRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      holdTriggeredRef.current = true;
      setActionMenuOpen(false);
      setActionMenuClosing(false);
      setQuickDeckClosing(false);
      setQuickDeckOpen(true);
      navigator.vibrate?.(12);
    }, 520);
  }

  function handlePointerUp(event) {
    if (shouldIgnoreVideoGesture(event)) return;
    window.clearTimeout(holdTimerRef.current);
  }

  useEffect(() => {
    if (!active) {
      setActionMenuOpen(false);
      setActionMenuClosing(false);
      setQuickDeckOpen(false);
      setQuickDeckClosing(false);
    }
  }, [active]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && active) {
          activeRef.current = true;
          startPlaybackSignals();
          video.currentTime = clip.start;
          requestActivePlayback();
          return;
        }

        activeRef.current = false;
        flushPlaybackSignals();
        pauseInactiveVideo(video);
      },
      { threshold: 0.72 }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
      pauseInactiveVideo(video);
    };
  }, [active, post.video_url, clip.start, flushPlaybackSignals, pauseInactiveVideo, requestActivePlayback, startPlaybackSignals]);



  useEffect(() => {
    function unlockSoundOnGesture() {
      const video = videoRef.current;
      if (!video || !activeRef.current || !needsSoundUnlock) return;

      video.muted = false;
      video.volume = 1;
      video.play().then(() => setNeedsSoundUnlock(false)).catch(() => {});
    }

    window.addEventListener("pointerdown", unlockSoundOnGesture, { passive: true });
    window.addEventListener("touchstart", unlockSoundOnGesture, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", unlockSoundOnGesture);
      window.removeEventListener("touchstart", unlockSoundOnGesture);
    };
  }, [needsSoundUnlock]);
  return (
    <article
      id={`post-${post.id}`}
      onClick={handleVideoSurfaceClick}
      onContextMenu={(event) => {
        event.preventDefault();
        closeActionMenu();
        setQuickDeckClosing(false);
        setQuickDeckOpen(true);
      }}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerUp}
      onPointerUp={handlePointerUp}
      className="kt-toast-expand-in relative h-full w-full min-w-0 overflow-hidden rounded-none border-0 bg-slate-950 shadow-sm"
    >
      <video
        ref={videoRef}
        src={post.video_url}
        autoPlay={active}
        controls={false}
        muted={false}
        playsInline
        preload="metadata"
        loop={false}
        onError={() => {
          setVideoLoading(false);
          setMediaError("Video could not load yet. It may still be uploading.");
          onMediaUnavailable?.();
        }}
        onCanPlay={() => {
          setVideoLoading(false);
          updateVideoProgress(videoRef.current);
          if (activeRef.current || active) requestActivePlayback();
        }}
        onLoadStart={() => setVideoLoading(true)}
        onPlaying={() => {
          setVideoLoading(false);
          markPlaybackViewed();
        }}
        onStalled={() => setVideoLoading(true)}
        onWaiting={() => setVideoLoading(true)}
        onDurationChange={(event) => updateVideoProgress(event.currentTarget)}
        onLoadedMetadata={(event) => updateVideoProgress(event.currentTarget)}
        onPlay={(event) => pauseOtherExploreMedia(event.currentTarget, { muteVideos: false })}
        onTimeUpdate={handleTimeUpdate}
        className={`absolute inset-0 h-full w-full ${videoFitClass}`}
      />

      {mediaError ? (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-slate-950 px-6 text-center">
          <p className="max-w-xs text-sm font-bold leading-6 text-white/70">{mediaError}</p>
        </div>
      ) : null}
      <div className={`absolute inset-0 ${fullscreen ? "bg-transparent" : "bg-slate-950/10"}`} />

      {videoLoading && !mediaError ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/35">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/35 border-t-white" />
          </div>
        </div>
      ) : null}

      {likeBurst ? (
        <div className="pointer-events-none absolute inset-0 z-[6] grid place-items-center">
          <span className="kt-swip-like-burst grid h-24 w-24 place-items-center rounded-full bg-white/16 text-white shadow-[0_24px_80px_rgba(255,255,255,0.22)] backdrop-blur-sm">
            <Heart size={54} fill="currentColor" strokeWidth={1.8} />
          </span>
        </div>
      ) : null}

      {!displayMinimal ? (
        <SwipActionRail
          fullscreen={fullscreen}
          post={post}
          liked={liked}
          saved={saved}
          onLike={onLike}
          onSave={onSave}
          onComment={() => setCommentOpen(true)}
          onFullscreen={onFullscreenToggle}
          onMore={() => {
            setActionMenuClosing(false);
            setActionMenuOpen(true);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setDisplayMinimal(false);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute right-4 top-20 z-20 rounded-full border border-white/15 bg-slate-950/35 px-3 py-2 text-xs font-black text-white shadow-2xl backdrop-blur-md"
        >
          Restore display
        </button>
      )}

      {!fullscreen && !displayMinimal ? (
        <SwipCaption
          post={post}
          categoryLabel={categoryLabel}
          contextLabel={contextLabel}
          onViewProfile={onViewProfile}
        />
      ) : null}

      {!displayMinimal ? <VideoProgress currentTime={progress.currentTime} duration={progress.duration} onSeek={handleSeek} /> : null}

      <CommentsDrawer
        currentUserId={currentUserId}
        open={commentOpen}
        post={post}
        onClose={() => setCommentOpen(false)}
        onCountChange={onComment}
        onViewProfile={onViewProfile}
      />

      {message && !fullscreen ? (
        <p className="absolute left-4 top-16 z-10 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-sky-700">
          {message}
        </p>
      ) : null}

    {actionMenuOpen ? (
  <ExploreActionDrawer closing={actionMenuClosing} onClose={() => closeActionMenu()} title="Manage this video">
    <div className="overflow-hidden rounded-[26px] border border-white/70 bg-white/90 p-2 shadow-[0_24px_70px_rgba(15,23,42,0.28)] backdrop-blur-2xl">
      <SwipActionItem icon={Send} title="Share Swip" onClick={handleShare} />
      <SwipActionItem icon={Link} title="Copy link" onClick={handleCopyLink} />
      <SwipActionItem icon={Download} title="Save video" onClick={handleDownload} />
      <SwipActionItem icon={Copy} title="Copy caption" onClick={handleCopyCaption} />
      <SwipActionItem icon={Repeat2} title="Repost" onClick={handleRepost} />
      <SwipActionItem icon={displayMinimal ? Eye : EyeOff} title={displayMinimal ? "Show display" : "Clear display"} onClick={toggleDisplayMinimal} />

      {isOwner ? (
        <SwipActionItem danger icon={Trash2} title="Delete Swip" onClick={openDeleteFromActions} />
      ) : null}

      {!isOwner ? (
        <SwipActionItem danger icon={Flag} title="Report Swip" onClick={handleReport} />
      ) : null}
    </div>
  </ExploreActionDrawer>
) : null}

      {quickDeckOpen ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/25 px-5 backdrop-blur-[2px]"
          onClick={() => closeQuickDeck()}
        >
          <section
            className={`${quickDeckClosing ? "kt-toast-collapse-out" : "kt-toast-expand-in"} w-full max-w-sm rounded-[28px] border-2 border-white/35 bg-slate-950/82 p-4 text-white shadow-2xl backdrop-blur-xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-white/55">Hold tools</p>
                <h3 className="mt-1 text-lg font-black">Quick Swip deck</h3>
              </div>
              <button
                type="button"
                onClick={() => closeQuickDeck()}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white"
                aria-label="Close quick Swip deck"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <SwipQuickAction icon={Download} label="Save" onClick={handleDownload} />
              <SwipQuickAction icon={displayMinimal ? Eye : EyeOff} label={displayMinimal ? "Show" : "Focus"} onClick={toggleDisplayMinimal} />
              <SwipQuickAction icon={Repeat2} label="Repost" onClick={handleRepost} />
              <SwipQuickAction icon={Link} label="Copy link" onClick={handleCopyLink} />
              <SwipQuickAction icon={Send} label="Share" onClick={handleShare} />
              {!isOwner ? <SwipQuickAction danger icon={Flag} label="Report" onClick={handleReport} /> : <SwipQuickAction icon={Copy} label="Caption" onClick={handleCopyCaption} />}
            </div>
          </section>
        </div>
      ) : null}

      {deleteOpen ? (
        <div className="absolute inset-0 z-30 flex items-end bg-slate-950/45 px-4 pb-5 backdrop-blur-sm" onClick={() => !deleting && setDeleteOpen(false)}>
          <div className="w-full rounded-[24px] border border-white/10 bg-white p-4 text-slate-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">Delete Swip</p>
            <h3 className="mt-1 text-lg font-black">Remove this video?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              This will remove the video from Swip and your profile feed.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={deleting} onClick={() => setDeleteOpen(false)} className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700 disabled:opacity-60">
                Cancel
              </button>
              <button type="button" disabled={deleting} onClick={confirmDelete} className="h-11 rounded-2xl bg-rose-600 text-sm font-black text-white disabled:opacity-60">
                {deleting ? "Deleting" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {repostOpen ? (
        <RepostComposer
          profile={profile}
          sourcePost={post}
          onClose={() => setRepostOpen(false)}
          onSuccess={() => setMessage("Repost published to UrFeed.")}
        />
      ) : null}
    </article>
  );
}

function SwipActionItem({ danger = false, icon, onClick, title }) {
  const ActionIcon = icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left text-sm font-black transition ${
        danger
          ? "bg-rose-500/10 text-rose-700 hover:bg-rose-500/15"
          : "text-slate-800 hover:bg-slate-100/80"
      }`}
    >
      <span
        className={`grid h-10 w-10 flex-none place-items-center rounded-2xl ${
          danger ? "bg-rose-500/10 text-rose-700" : "bg-slate-100 text-slate-700"
        }`}
      >
        <ActionIcon size={18} />
      </span>

      <span className="truncate">{title}</span>
    </button>
  );
}
