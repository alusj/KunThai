import { useEffect, useRef, useState } from "react";
import { HiOutlineSpeakerWave, HiOutlineSpeakerXMark, HiOutlineXMark } from "react-icons/hi2";

import { useBrowserBack } from "../../../../../Backend/hooks/useBrowserBack";
import { readExploreSettings } from "../../../../../Backend/services/explore/preferencesService";
import CommentsDrawer from "../../urfeed/feed/comments/CommentsDrawer";
import { sharePost } from "../../urfeed/feed/post/postUtils";
import SwipActionRail from "./SwipActionRail";
import SwipCaption from "./SwipCaption";

const SWIP_VIDEO_SOUND_EVENT = "swip-video-sound";
let swipSoundMuted = true;
let swipSettingsLoaded = false;

export default function VideoCard({
  post,
  categoryLabel = "",
  contextLabel = "",
  currentUserId = "",
  liked,
  saved,
  isOwner,
  onLike,
  onSave,
  onComment,
  onDelete,
  onViewProfile,
}) {
  const [commentOpen, setCommentOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  if (!swipSettingsLoaded) {
    swipSoundMuted = readExploreSettings().video.defaultMuted;
    swipSettingsLoaded = true;
  }

  const videoSettings = readExploreSettings().video;
  const [muted, setMuted] = useState(swipSoundMuted);
  const [message, setMessage] = useState("");
  const videoRef = useRef(null);
  const holdTimerRef = useRef(null);
  const activeRef = useRef(false);

  useBrowserBack(commentOpen, () => setCommentOpen(false), `swip-comments-${post.id}`);
  useBrowserBack(fullscreen, () => setFullscreen(false), `swip-fullscreen-${post.id}`);

  useEffect(() => () => window.clearTimeout(holdTimerRef.current), []);

  async function handleShare() {
    const nextMessage = await sharePost(post);
    setMessage(nextMessage);
  }

  function toggleMute() {
    setMuted((current) => {
      const next = !current;
      if (videoRef.current) {
        videoRef.current.muted = next || !activeRef.current;
      }
      swipSoundMuted = next;
      window.dispatchEvent(new CustomEvent(SWIP_VIDEO_SOUND_EVENT, { detail: { muted: next } }));
      return next;
    });
  }

  function shouldIgnoreVideoGesture(event) {
    return Boolean(event.target.closest("button, a, input, textarea, [role='button']"));
  }

  function toggleVideoSound() {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
    toggleMute();
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
    videoRef.current?.play().catch(() => {});
  }

  useEffect(() => {
    const video = videoRef.current;

    if (!video || fullscreen) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          activeRef.current = true;
          video.muted = swipSoundMuted;
          if (videoSettings.autoplay && !videoSettings.reduceData) {
            video.play().catch(() => {});
          }
          return;
        }

        activeRef.current = false;
        video.pause();
        video.muted = true;
      },
      { threshold: 0.6 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [fullscreen, post.video_url, videoSettings.autoplay, videoSettings.reduceData]);

  useEffect(() => {
    function handleSoundChanged(event) {
      const nextMuted = event.detail?.muted ?? true;
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
        if (!shouldIgnoreVideoGesture(event)) toggleVideoSound();
      }}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerUp}
      onPointerUp={handlePointerUp}
      className={`relative overflow-hidden bg-slate-950 shadow-sm ${
        fullscreen
          ? "fixed inset-0 z-[70] h-screen w-screen rounded-none"
          : "w-full min-w-0 min-h-[calc(100vh-176px)] snap-start rounded-[28px] border border-slate-800/20 sm:min-h-[720px]"
      }`}
    >
      <video
        ref={videoRef}
        src={post.video_url}
        autoPlay={videoSettings.autoplay && !videoSettings.reduceData}
        controls={fullscreen}
        muted={muted}
        playsInline
        loop
        preload={videoSettings.reduceData ? "none" : "metadata"}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-slate-950/10" />

      <button
        type="button"
        onClick={toggleMute}
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/45 text-lg text-white backdrop-blur"
        aria-label={muted ? "Unmute video" : "Mute video"}
      >
        {muted ? <HiOutlineSpeakerXMark /> : <HiOutlineSpeakerWave />}
      </button>

      {fullscreen ? (
        <button
          type="button"
          onClick={() => setFullscreen(false)}
          className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-xl text-slate-900 shadow-lg"
          aria-label="Close full-screen video"
        >
          <HiOutlineXMark />
        </button>
      ) : null}

      <SwipActionRail
        post={post}
        liked={liked}
        saved={saved}
        isOwner={isOwner}
        onLike={onLike}
        onSave={onSave}
        onComment={() => setCommentOpen(true)}
        onDelete={onDelete}
        onShare={handleShare}
      />

      <SwipCaption
        post={post}
        categoryLabel={categoryLabel}
        contextLabel={contextLabel}
        onFullscreen={() => setFullscreen(true)}
        onViewProfile={onViewProfile}
      />

      <CommentsDrawer
        currentUserId={currentUserId}
        open={commentOpen}
        post={post}
        onClose={() => setCommentOpen(false)}
        onCreated={onComment}
        onViewProfile={onViewProfile}
      />
      {message ? <p className="absolute left-4 top-16 z-10 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-sky-700">{message}</p> : null}
    </article>
  );

  return content;
}
