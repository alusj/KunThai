import { useEffect, useMemo, useRef, useState } from "react";

import { useBrowserBack } from "../../../../../Backend/hooks/useBrowserBack";
import CommentsDrawer from "../../urfeed/feed/comments/CommentsDrawer";
import { sharePost } from "../../urfeed/feed/post/postUtils";
import { pauseOtherExploreMedia, playExploreMedia, stopAllExploreMedia } from "../../../shared/singleMediaPlayback";
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
  fullscreen = false,
  liked,
  saved,
  isOwner,
  onLike,
  onSave,
  onComment,
  onDelete,
  onFullscreenToggle,
  onViewProfile,
}) {
  const [commentOpen, setCommentOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [progress, setProgress] = useState({ currentTime: 0, duration: MAX_SWIP_SECONDS });
  const [message, setMessage] = useState("");
  const [needsSoundUnlock, setNeedsSoundUnlock] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);

  const videoRef = useRef(null);
  const holdTimerRef = useRef(null);
  const activeRef = useRef(false);

  const clip = useMemo(() => getClipWindow(post, progress.realDuration || 0), [post, progress.realDuration]);

  useBrowserBack(commentOpen, () => setCommentOpen(false), `swip-comments-${post.id}`);

  useEffect(() => {
    setMediaError("");
    setNeedsSoundUnlock(false);
    setVideoLoading(true);
    setProgress({ currentTime: 0, duration: MAX_SWIP_SECONDS, realDuration: 0 });
  }, [post.video_url]);

  useEffect(
    () => () => {
      window.clearTimeout(holdTimerRef.current);
      stopAllExploreMedia(null, { muteVideos: false });
    },
    []
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    activeRef.current = active;

    if (active) {
      video.currentTime = clip.start;
      requestActivePlayback();
      return;
    }

    pauseInactiveVideo(video);
  }, [active, post.video_url, clip.start]);

  useEffect(() => {
  if (!active) return undefined;

  function handleSwipActivePlay(event) {
    requestActivePlayback({ sound: event.detail?.sound !== false });
  }

  window.addEventListener("swip-active-play", handleSwipActivePlay);
  return () => window.removeEventListener("swip-active-play", handleSwipActivePlay);
}, [active, post.video_url, clip.start]);

  async function handleShare() {
    const nextMessage = await sharePost(post);
    setMessage(nextMessage);
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

  function pauseInactiveVideo(video) {
    video.pause();
    video.muted = false;
    video.volume = 1;
    video.currentTime = clip.start;
    setProgress((current) => ({
      ...current,
      currentTime: 0,
      duration: MAX_SWIP_SECONDS,
    }));
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

    if (video.currentTime >= nextClip.end) {
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

    setProgress({
      currentTime: clampedRelative,
      duration: nextClip.duration,
      realDuration,
    });
  }

  async function requestActivePlayback({ sound = true } = {}) {
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

  function handlePointerDown(event) {
    if (shouldIgnoreVideoGesture(event)) return;
    window.clearTimeout(holdTimerRef.current);
  }

  function handlePointerUp(event) {
    if (shouldIgnoreVideoGesture(event)) return;
    window.clearTimeout(holdTimerRef.current);
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && active) {
          activeRef.current = true;
          video.currentTime = clip.start;
          requestActivePlayback();
          return;
        }

        activeRef.current = false;
        pauseInactiveVideo(video);
      },
      { threshold: 0.72 }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
      pauseInactiveVideo(video);
    };
  }, [active, post.video_url, clip.start]);



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
      onClick={(event) => {
        if (!shouldIgnoreVideoGesture(event)) handleVideoTap();
      }}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerUp}
      onPointerUp={handlePointerUp}
      className="relative h-full w-full min-w-0 overflow-hidden rounded-none border-0 bg-slate-950 shadow-sm"
    >
      <video
        ref={videoRef}
        src={post.video_url}
        autoPlay={active}
        controls={false}
        muted={false}
        playsInline
        loop={false}
        onError={() => {
          setVideoLoading(false);
          setMediaError("Video could not load yet. It may still be uploading.");
        }}
        onCanPlay={() => {
          setVideoLoading(false);
          updateVideoProgress(videoRef.current);
          if (activeRef.current || active) requestActivePlayback();
        }}
        onLoadStart={() => setVideoLoading(true)}
        onPlaying={() => setVideoLoading(false)}
        onStalled={() => setVideoLoading(true)}
        onWaiting={() => setVideoLoading(true)}
        onDurationChange={(event) => updateVideoProgress(event.currentTarget)}
        onLoadedMetadata={(event) => updateVideoProgress(event.currentTarget)}
        onPlay={(event) => pauseOtherExploreMedia(event.currentTarget, { muteVideos: false })}
        onTimeUpdate={handleTimeUpdate}
        preload={active ? "metadata" : "none"}
        className="absolute inset-0 h-full w-full object-cover"
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

      <SwipActionRail
        fullscreen={fullscreen}
        post={post}
        liked={liked}
        saved={saved}
        isOwner={isOwner}
        onLike={onLike}
        onSave={onSave}
        onComment={() => setCommentOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        onFullscreen={onFullscreenToggle}
        onShare={handleShare}
      />

      {!fullscreen ? (
        <SwipCaption
          post={post}
          categoryLabel={categoryLabel}
          contextLabel={contextLabel}
          onViewProfile={onViewProfile}
        />
      ) : null}

      <VideoProgress currentTime={progress.currentTime} duration={progress.duration} onSeek={handleSeek} />

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
    </article>
  );
}
