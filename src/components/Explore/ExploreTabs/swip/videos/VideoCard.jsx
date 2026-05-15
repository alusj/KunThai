import { useEffect, useRef, useState } from "react";
import { HiOutlineSpeakerWave, HiOutlineSpeakerXMark } from "react-icons/hi2";

import { useBrowserBack } from "../../../../../Backend/hooks/useBrowserBack";
import { readExploreSettings } from "../../../../../Backend/services/explore/preferencesService";
import CommentsDrawer from "../../urfeed/feed/comments/CommentsDrawer";
import { sharePost } from "../../urfeed/feed/post/postUtils";
import { pauseOtherExploreMedia, playExploreMedia, stopAllExploreMedia } from "../../../shared/singleMediaPlayback";
import SwipActionRail from "./SwipActionRail";
import SwipCaption from "./SwipCaption";

const SWIP_VIDEO_SOUND_EVENT = "swip-video-sound";
let swipSoundMuted = false;
let swipSoundUnlocked = false;
let swipSettingsLoaded = false;

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
  if (!swipSettingsLoaded) {
    swipSoundMuted = false;
    swipSettingsLoaded = true;
  }

  const videoSettings = readExploreSettings().video;
  const [muted, setMuted] = useState(swipSoundMuted);
  const [message, setMessage] = useState("");
  const videoRef = useRef(null);
  const holdTimerRef = useRef(null);
  const activeRef = useRef(false);

  useBrowserBack(commentOpen, () => setCommentOpen(false), `swip-comments-${post.id}`);

  useEffect(() => {
    setMediaError("");
  }, [post.video_url]);

  useEffect(() => () => {
    window.clearTimeout(holdTimerRef.current);
    stopAllExploreMedia();
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
  }, [active, post.video_url, videoSettings.autoplay, videoSettings.reduceData]);

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

  function toggleMute() {
    setMuted((current) => {
      const next = !current;
      if (videoRef.current) {
        videoRef.current.muted = next || !activeRef.current;
      }
      swipSoundMuted = next;
      swipSoundUnlocked = !next;
      window.dispatchEvent(new CustomEvent(SWIP_VIDEO_SOUND_EVENT, { detail: { muted: next, soundUnlocked: swipSoundUnlocked } }));
      return next;
    });
  }

  function pauseInactiveVideo(video) {
    video.pause();
    video.muted = true;
    if (!Number.isNaN(video.currentTime)) {
      video.currentTime = 0;
    }
  }

  async function requestActivePlayback({ userGesture = false } = {}) {
    const video = videoRef.current;
    if (!video || !videoSettings.autoplay || videoSettings.reduceData) {
      return;
    }

    activeRef.current = true;

    const shouldTrySound = userGesture || swipSoundUnlocked || !swipSoundMuted;
    if (shouldTrySound) {
      try {
        video.muted = false;
        await playExploreMedia(video);
        swipSoundMuted = false;
        swipSoundUnlocked = true;
        setMuted(false);
        window.dispatchEvent(new CustomEvent(SWIP_VIDEO_SOUND_EVENT, { detail: { muted: false, soundUnlocked: true } }));
        return;
      } catch {
        // Mobile browsers can block sound until a user gesture. Fall through to muted autoplay.
      }
    }

    try {
      video.muted = true;
      await playExploreMedia(video);
      swipSoundMuted = true;
      setMuted(true);
      window.dispatchEvent(new CustomEvent(SWIP_VIDEO_SOUND_EVENT, { detail: { muted: true, soundUnlocked: false } }));
    } catch {
      // Keep the poster frame if autoplay is completely blocked.
    }
  }

  function shouldIgnoreVideoGesture(event) {
    return Boolean(event.target.closest("button, a, input, textarea, [role='button']"));
  }

  function handleVideoTap() {
    if (!activeRef.current) {
      return;
    }

    swipSoundMuted = false;
    swipSoundUnlocked = true;
    setMuted(false);
    requestActivePlayback({ userGesture: true });
  }

  function handlePointerDown(event) {
    if (shouldIgnoreVideoGesture(event)) {
      return;
    }

    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      videoRef.current?.pause();
    }, 180);
  }

  function handlePointerUp(event) {
    if (shouldIgnoreVideoGesture(event)) {
      return;
    }

    window.clearTimeout(holdTimerRef.current);
    requestActivePlayback({ userGesture: true });
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
  }, [active, post.video_url, videoSettings.autoplay, videoSettings.reduceData]);

  useEffect(() => {
    function handleSoundChanged(event) {
      const nextMuted = event.detail?.muted ?? true;
      swipSoundUnlocked = Boolean(event.detail?.soundUnlocked);
      if (videoRef.current) {
        videoRef.current.muted = nextMuted || !activeRef.current;
      }
      setMuted(nextMuted);
    }

    setMuted(swipSoundMuted);
    if (videoRef.current) {
      videoRef.current.muted = swipSoundMuted || !activeRef.current;
    }

    window.addEventListener(SWIP_VIDEO_SOUND_EVENT, handleSoundChanged);
    return () => window.removeEventListener(SWIP_VIDEO_SOUND_EVENT, handleSoundChanged);
  }, []);

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
        autoPlay={videoSettings.autoplay && !videoSettings.reduceData}
        controls={false}
        muted={muted}
        playsInline
        loop
        onError={() => setMediaError("Video is still being prepared.")}
        onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
        preload={videoSettings.reduceData ? "none" : "auto"}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {mediaError ? <div className="absolute inset-0 z-[1] bg-slate-950" /> : null}
      <div className={`absolute inset-0 ${fullscreen ? "bg-transparent" : "bg-slate-950/10"}`} />

      {!fullscreen ? (
        <button
          type="button"
          onClick={toggleMute}
          className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-slate-950/28 text-base text-white shadow-xl backdrop-blur"
          aria-label={muted ? "Unmute video" : "Mute video"}
        >
          {muted ? <HiOutlineSpeakerXMark /> : <HiOutlineSpeakerWave />}
        </button>
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
