import { HiOutlineXMark } from "react-icons/hi2";

import { pauseOtherExploreMedia } from "../../../../shared/singleMediaPlayback";

function RemoveButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm"
      aria-label="Remove media"
    >
      <HiOutlineXMark />
    </button>
  );
}

export default function MediaPreview({
  imagePreview,
  videoPreview,
  audioPreview,
  pendingVideoUrl,
  videoDuration = 0,
  videoTrimStart = 0,
  maxVideoSeconds = 15,
  trimmingVideo = false,
  onTrimStartChange,
  onTrimVideo,
  onRemoveImage,
  onRemoveVideo,
  onRemoveAudio,
}) {
  if (!imagePreview && !videoPreview && !audioPreview && !pendingVideoUrl) {
    return null;
  }

  return (
    <div className="space-y-3">
      {imagePreview ? (
        <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-slate-100">
          <img src={imagePreview} alt="Selected post attachment" className="max-h-[360px] w-full object-cover" />
          <RemoveButton onClick={onRemoveImage} />
        </div>
      ) : null}

      {videoPreview ? (
        <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-slate-950">
          <video
            src={videoPreview}
            controls
            onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
            className="max-h-[420px] w-full object-contain"
          />
          <RemoveButton onClick={onRemoveVideo} />
          <div className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-slate-800">
            Sending to Swip
          </div>
        </div>
      ) : null}

      {pendingVideoUrl ? (
        <div className="relative overflow-hidden rounded-[22px] border border-amber-200 bg-amber-50 p-4">
          <video
            src={pendingVideoUrl}
            controls
            onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
            className="max-h-[360px] w-full rounded-[18px] bg-slate-950 object-contain"
          />
          <RemoveButton onClick={onRemoveVideo} />
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-sm font-black text-amber-900">Trim required</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
                This video is {Math.ceil(videoDuration)} seconds. Choose a {maxVideoSeconds}-second section to post.
              </p>
            </div>
            <label className="block text-xs font-black uppercase tracking-[0.16em] text-amber-700">
              Start at {Math.round(videoTrimStart)}s
            </label>
            <input
              type="range"
              min="0"
              max={Math.max(0, Math.floor(videoDuration - maxVideoSeconds))}
              value={videoTrimStart}
              onChange={(event) => onTrimStartChange?.(Number(event.target.value))}
              className="w-full accent-amber-600"
            />
            <button
              type="button"
              onClick={onTrimVideo}
              disabled={trimmingVideo}
              className="h-11 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white disabled:bg-slate-300"
            >
              {trimmingVideo ? "Trimming..." : `Trim to ${maxVideoSeconds}s`}
            </button>
          </div>
        </div>
      ) : null}

      {audioPreview ? (
        <div className="relative rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-sm font-bold text-slate-900">Voice note</p>
          <audio controls src={audioPreview} onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)} className="h-10 w-full" />
          <RemoveButton onClick={onRemoveAudio} />
        </div>
      ) : null}
    </div>
  );
}
