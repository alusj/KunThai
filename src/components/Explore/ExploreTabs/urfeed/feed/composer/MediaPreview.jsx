import { HiOutlineXMark } from "react-icons/hi2";

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
  onRemoveImage,
  onRemoveVideo,
  onRemoveAudio,
}) {
  if (!imagePreview && !videoPreview && !audioPreview) {
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
          <video src={videoPreview} controls className="max-h-[420px] w-full object-contain" />
          <RemoveButton onClick={onRemoveVideo} />
          <div className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-slate-800">
            Sending to Swip
          </div>
        </div>
      ) : null}

      {audioPreview ? (
        <div className="relative rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-sm font-bold text-slate-900">Voice note</p>
          <audio controls src={audioPreview} className="h-10 w-full" />
          <RemoveButton onClick={onRemoveAudio} />
        </div>
      ) : null}
    </div>
  );
}
