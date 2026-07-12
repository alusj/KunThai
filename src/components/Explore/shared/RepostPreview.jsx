import { Play, Repeat2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buildExploreRepostSnapshot } from "../../../Backend/services/explore/repostService";
import { openMentionContent } from "../../../Backend/services/explore/linkTokenService";
import Avatar from "../shared/Avatar";
import ExpandablePostText from "./ExpandablePostText";

export default function RepostPreview({ post, sourcePost = null, compact = false }) {
  const source = sourcePost ? buildExploreRepostSnapshot(sourcePost) : post?.media_meta?.repost || post?.mediaMeta?.repost;
  if (!source) return null;

  function openAuthorProfile() {
    if (compact) return;

    if (source.authorUserId) {
      window.dispatchEvent(new CustomEvent("kuntai-open-profile", {
        detail: {
          userId: source.authorUserId,
          displayName: source.authorName || "",
          username: source.authorUsername || "",
          avatarUrl: source.authorAvatarUrl || "",
        },
      }));
      return;
    }

    if (source.authorUsername) openMentionContent(source.authorUsername);
  }

  return (
    <section className={`overflow-hidden rounded-[22px] border-2 border-slate-200 bg-white shadow-sm ${compact ? "" : "mx-4 mb-4"}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-sky-700">
        <Repeat2 size={15} strokeWidth={2.5} />
        Reposted from {source.sourceType === "swip" ? "Swip" : "UrFeed"}
      </div>
      <button
        type="button"
        onClick={openAuthorProfile}
        disabled={compact}
        aria-label={`View ${source.authorName || "profile"}`}
        className={`flex w-full items-center gap-3 px-4 pt-4 text-left ${compact ? "" : "kt-pressable"}`}
      >
        <Avatar name={source.authorName} src={source.authorAvatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">{source.authorName || "Profile"}</p>
          <p className="truncate text-xs font-bold text-slate-500">@{source.authorUsername || "user"}</p>
        </div>
      </button>
      {source.body ? (
        <ExpandablePostText
          text={source.body}
          className="px-4 py-3 text-sm font-semibold leading-6"
          textClassName="text-slate-800"
          controlClassName="text-sky-700"
        />
      ) : null}
      {source.imageUrl ? <img src={source.imageUrl} alt="Reposted media" className="mt-3 aspect-[4/3] w-full object-cover" /> : null}
      {source.videoUrl ? <RepostSwipVideo compact={compact} source={source} /> : null}
      {source.audioUrl ? (
        <div className="p-4">
          <audio src={source.audioUrl} controls preload="metadata" className="w-full" />
        </div>
      ) : null}
    </section>
  );
}

const REPOST_SWIP_PREVIEW_SECONDS = 10;

// Shared Swip clips autoplay muted while on screen (looping the shared clip
// window). Tapping the video jumps straight into Swip focused on the source
// post, which renders its own Back button; the speaker button toggles sound
// without leaving the feed.
function RepostSwipVideo({ compact, source }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  function getPreviewWindow(video) {
    const duration = Number(video?.duration || 0);
    const requestedStart = Number(source.videoTrimStart || 0);
    const start = Math.max(0, Math.min(requestedStart, Math.max(0, duration - 0.1)));
    const requestedEnd = Number(source.videoTrimEnd);
    const clipEnd = Number.isFinite(requestedEnd) && requestedEnd > start ? requestedEnd : duration;
    return { start, end: Math.min(clipEnd || duration, start + REPOST_SWIP_PREVIEW_SECONDS) };
  }

  const inViewRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video || typeof IntersectionObserver === "undefined") return undefined;

    const attemptPlay = () => {
      if (inViewRef.current && video.paused) video.play().catch(() => {});
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = Boolean(entry.isIntersecting && entry.intersectionRatio >= 0.5);
        if (inViewRef.current) attemptPlay();
        else video.pause();
      },
      { threshold: [0, 0.5, 1] },
    );

    observer.observe(container);
    // The first play() can be aborted by the initial clip-window seek; retry
    // once the video reports it can actually play.
    video.addEventListener("canplay", attemptPlay);
    video.addEventListener("seeked", attemptPlay);

    // If the observer has not reported yet (some embedded webviews are slow to
    // deliver the first entry), fall back to a one-off viewport check so an
    // on-screen clip still starts automatically.
    const initialVisibilityCheck = window.setTimeout(() => {
      if (inViewRef.current) return;
      const rect = container.getBoundingClientRect();
      const visible = rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
      if (visible) {
        inViewRef.current = true;
        attemptPlay();
      }
    }, 400);

    return () => {
      observer.disconnect();
      video.removeEventListener("canplay", attemptPlay);
      video.removeEventListener("seeked", attemptPlay);
      window.clearTimeout(initialVisibilityCheck);
    };
  }, []);

  function handleLoadedMetadata(event) {
    const { start } = getPreviewWindow(event.currentTarget);
    event.currentTarget.currentTime = start;
  }

  function handleTimeUpdate(event) {
    const video = event.currentTarget;
    const { start, end } = getPreviewWindow(video);
    if (end && video.currentTime >= end - 0.04) {
      video.currentTime = start;
    }
  }

  function openSwip() {
    window.dispatchEvent(new CustomEvent("explore-open-reposted-swip", {
      detail: { postId: source.sourcePostId },
    }));
  }

  function handleVideoTap() {
    if (!compact) {
      openSwip();
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function toggleMute(event) {
    event.stopPropagation();
    setMuted((current) => {
      const nextMuted = !current;
      // Unmuting is a user gesture, so a previously blocked autoplay can
      // start now instead of leaving a frozen frame.
      const video = videoRef.current;
      if (!nextMuted && video?.paused) video.play().catch(() => {});
      return nextMuted;
    });
  }

  return (
    <div ref={containerRef} className="relative mt-3 aspect-video w-full overflow-hidden bg-slate-950">
      <video
        ref={videoRef}
        src={source.videoUrl}
        muted={muted}
        playsInline
        preload="metadata"
        onClick={handleVideoTap}
        onLoadedMetadata={handleLoadedMetadata}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onTimeUpdate={handleTimeUpdate}
        className="h-full w-full cursor-pointer object-cover"
      />
      {!compact ? (
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-slate-950/60 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur-md">
          Swip · tap to watch
        </span>
      ) : null}
      {compact && !playing ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-950/65 text-white shadow-2xl backdrop-blur-md">
            <Play size={23} fill="currentColor" className="ml-1" />
          </span>
        </span>
      ) : null}
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "Unmute Swip preview" : "Mute Swip preview"}
        className="kt-pressable absolute bottom-3 right-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-slate-950/60 text-white shadow-xl backdrop-blur-md"
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
    </div>
  );
}
