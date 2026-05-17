import { useEffect, useRef, useState } from "react";

import { useBrowserBack } from "../../../../../Backend/hooks/useBrowserBack";
import CommentsDrawer from "../../urfeed/feed/comments/CommentsDrawer";
import { sharePost } from "../../urfeed/feed/post/postUtils";
import { pauseOtherExploreMedia, playExploreMedia, stopAllExploreMedia } from "../../../shared/singleMediaPlayback";
import SwipActionRail from "./SwipActionRail";
import SwipCaption from "./SwipCaption";
import VideoProgress from "./VideoProgress";

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
  const [progress, setProgress] = useState({ currentTime: 0, duration: 0 });

  const [message, setMessage] = useState("");
  const videoRef = useRef(null);
  const holdTimerRef = useRef(null);
  const activeRef = useRef(false);

  useBrowserBack(commentOpen, () => setCommentOpen(false), `swip-comments-${post.id}`);

  useEffect(() => {
    setMediaError("");
    setProgress({ currentTime: 0, duration: 0 });
  }, [post.video_url]);

  useEffect(() => () => {
    window.clearTimeout(holdTimerRef.current);
    stopAllExploreMedia(null, { muteVideos: false });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    activeRef.current = active;
    if (active) {
      requestActivePlayback();
      return;
    }

    pauseInactiveVideo(video);
  }, [active, post.video_url]);

  useEffect(() => {
    function handleSwipActivePlay(event) {
      if (activeRef.current || active) {
        requestActivePlayback({ sound: Boolean(event.detail?.sound) });
      }
    }

    window.addEventListener("swip-active-play", handleSwipActivePlay);
    return () => window.removeEventListener("swip-active-play", handleSwipActivePlay);
  }, [active, post.video_url]);

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
    video.defaultMuted = false;
    video.volume = 1;
    if (!Number.isNaN(video.currentTime)) {
      video.currentTime = 0;
    }
    setProgress((current) => ({ ...current, currentTime: 0 }));
  }

  function updateVideoProgress(video) {
    if (!video) {
      return;
    }

    setProgress({
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    });
  }

  function handleSeek(nextTime) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(nextTime)) {
      return;
    }

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const clampedTime = duration > 0 ? Math.min(Math.max(nextTime, 0), duration) : 0;
    video.currentTime = clampedTime;
    video.muted = false;
    video.defaultMuted = false;
    video.volume = 1;
    setProgress({
      currentTime: clampedTime,
      duration,
    });
  }

  async function requestActivePlayback() {
    if (!activeRef.current) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!video.paused && !video.muted) {
      return;
    }

    activeRef.current = true;
    video.muted = false;
    video.defaultMuted = false;
    video.volume = 1;
    try {
      await playExploreMedia(video, { muteVideos: false });
    } catch {
      video.muted = false;
      video.defaultMuted = false;
      video.volume = 1;
    }
  }

  function shouldIgnoreVideoGesture(event) {
    return Boolean(event.target.closest("button, a, input, textarea, [role='button']"));
  }

  function handleVideoTap() {
    if (!activeRef.current) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = false;
    video.defaultMuted = false;
    video.volume = 1;

    if (video.paused) {
      requestActivePlayback();
      return;
    }

    video.pause();
  }

  function handlePointerDown(event) {
    if (shouldIgnoreVideoGesture(event)) {
      return;
    }

    window.clearTimeout(holdTimerRef.current);
  }

  function handlePointerUp(event) {
    if (shouldIgnoreVideoGesture(event)) {
      return;
    }

    window.clearTimeout(holdTimerRef.current);
  }

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && active) {
          activeRef.current = true;
          requestActivePlayback();
          return;
        }

        activeRef.current = false;
        pauseInactiveVideo(video);
      },
      { threshold: 0.72 },
    );

    observer.observe(video);
    return () => {
      observer.disconnect();
      pauseInactiveVideo(video);
    };
  }, [active, post.video_url]);

  const content = (
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
        autoPlay
        controls={false}
        muted={false}
        defaultMuted={false}
        playsInline
        loop
        onError={() => setMediaError("Video is still being prepared.")}
        onCanPlay={() => {
          updateVideoProgress(videoRef.current);
          if (activeRef.current || active) requestActivePlayback();
        }}
        onDurationChange={(event) => updateVideoProgress(event.currentTarget)}
        onLoadedMetadata={(event) => updateVideoProgress(event.currentTarget)}
        onPlay={(event) => pauseOtherExploreMedia(event.currentTarget, { muteVideos: false })}
        onTimeUpdate={(event) => updateVideoProgress(event.currentTarget)}
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {mediaError ? <div className="absolute inset-0 z-[1] bg-slate-950" /> : null}
      <div className={`absolute inset-0 ${fullscreen ? "bg-transparent" : "bg-slate-950/10"}`} />

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
      {message && !fullscreen ? <p className="absolute left-4 top-16 z-10 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-sky-700">{message}</p> : null}
      {deleteOpen ? (
        <div className="absolute inset-0 z-30 flex items-end bg-slate-950/45 px-4 pb-5 backdrop-blur-sm" onClick={() => !deleting && setDeleteOpen(false)}>
          <div
            className="w-full rounded-[24px] border border-white/10 bg-white p-4 text-slate-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">Delete Swip</p>
            <h3 className="mt-1 text-lg font-black">Remove this video?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              This will remove the video from Swip and your profile feed.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteOpen(false)}
                className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="h-11 rounded-2xl bg-rose-600 text-sm font-black text-white disabled:opacity-60"
              >
                {deleting ? "Deleting" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );

  return content;
}
