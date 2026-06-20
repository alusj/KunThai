import { ArrowRight, Pause, Play, Repeat2 } from "lucide-react";
import { useRef, useState } from "react";

import { buildExploreRepostSnapshot } from "../../../Backend/services/explore/repostService";
import Avatar from "../shared/Avatar";
import ExpandablePostText from "./ExpandablePostText";

export default function RepostPreview({ post, sourcePost = null, compact = false }) {
  const source = sourcePost ? buildExploreRepostSnapshot(sourcePost) : post?.media_meta?.repost || post?.mediaMeta?.repost;
  if (!source) return null;

  return (
    <section className={`overflow-hidden rounded-[22px] border-2 border-slate-200 bg-white shadow-sm ${compact ? "" : "mx-4 mb-4"}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-sky-700">
        <Repeat2 size={15} strokeWidth={2.5} />
        Reposted from {source.sourceType === "swip" ? "Swip" : "UrFeed"}
      </div>
      <div className="flex items-center gap-3 px-4 pt-4">
        <Avatar name={source.authorName} src={source.authorAvatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">{source.authorName || "Profile"}</p>
          <p className="truncate text-xs font-bold text-slate-500">@{source.authorUsername || "user"}</p>
        </div>
      </div>
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

function RepostSwipVideo({ compact, source }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [previewComplete, setPreviewComplete] = useState(false);

  function getPreviewWindow(video) {
    const duration = Number(video?.duration || 0);
    const requestedStart = Number(source.videoTrimStart || 0);
    const start = Math.max(0, Math.min(requestedStart, Math.max(0, duration - 0.1)));
    const requestedEnd = Number(source.videoTrimEnd);
    const clipEnd = Number.isFinite(requestedEnd) && requestedEnd > start ? requestedEnd : duration;
    return { start, end: Math.min(clipEnd || duration, start + REPOST_SWIP_PREVIEW_SECONDS) };
  }

  function handleLoadedMetadata(event) {
    const { start } = getPreviewWindow(event.currentTarget);
    event.currentTarget.currentTime = start;
  }

  function handleTimeUpdate(event) {
    const video = event.currentTarget;
    const { end } = getPreviewWindow(video);
    if (!end || video.currentTime < end - 0.04) return;
    video.pause();
    setPlaying(false);
    setPreviewComplete(true);
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video || previewComplete) return;
    if (!video.paused) {
      video.pause();
      setPlaying(false);
      return;
    }
    const { start, end } = getPreviewWindow(video);
    if (video.currentTime < start || video.currentTime >= end - 0.04) video.currentTime = start;
    setStarted(true);
    try {
      await video.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  function continueToSwip() {
    window.dispatchEvent(new CustomEvent("explore-open-reposted-swip", {
      detail: { postId: source.sourcePostId },
    }));
  }

  return (
    <div className="relative mt-3 aspect-video w-full overflow-hidden bg-slate-950">
      <video
        ref={videoRef}
        src={source.videoUrl}
        playsInline
        preload="metadata"
        onClick={togglePlayback}
        onEnded={() => setPreviewComplete(true)}
        onLoadedMetadata={handleLoadedMetadata}
        onPause={() => setPlaying(false)}
        onPlay={() => {
          setStarted(true);
          setPlaying(true);
        }}
        onTimeUpdate={handleTimeUpdate}
        className="h-full w-full object-cover"
      />
      {!previewComplete ? (
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={playing ? "Pause Swip preview" : "Play Swip preview"}
          className={`absolute inset-0 grid place-items-center bg-slate-950/10 transition ${playing ? "opacity-0 hover:opacity-100" : "opacity-100"}`}
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-950/65 text-white shadow-2xl backdrop-blur-md">
            {playing ? <Pause size={22} fill="currentColor" /> : <Play size={23} fill="currentColor" className="ml-1" />}
          </span>
        </button>
      ) : null}
      {!compact && previewComplete ? (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <button
            type="button"
            onClick={continueToSwip}
            className="kt-pressable flex min-h-12 items-center gap-2 rounded-full bg-white px-5 text-sm font-black text-slate-950 shadow-2xl"
          >
            Continue to Swip
            <ArrowRight size={18} />
          </button>
        </div>
      ) : null}
      {!compact && started && !previewComplete ? (
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-slate-950/60 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur-md">
          10-sec preview
        </span>
      ) : null}
    </div>
  );
}
