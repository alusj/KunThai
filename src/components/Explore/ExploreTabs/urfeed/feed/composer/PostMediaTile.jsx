import { HiOutlinePhoto, HiOutlinePlus, HiOutlineScissors, HiOutlineVideoCamera, HiOutlineXMark } from "react-icons/hi2";

import { useI18n } from "../../../../../../i18n";
import { formatVideoMb } from "../../../../../../Backend/services/media/videoTrimService";

function clipClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// The post card's media box: the picked photo or the video's first frame, or a
// button to pick one. Picking opens the phone's gallery for photos and videos.
// videoCheck: the attached clip's length and upload size ({ status, bytes,
// seconds }), shown on the tile; "checking" while the phone prepares it.
export default function PostMediaTile({ imagePreview = "", videoPreview = "", trimStart = 0, videoCheck = null, onPick, onRemove, onTrim }) {
  const { t } = useI18n();
  const hasMedia = Boolean(imagePreview || videoPreview);

  if (!hasMedia) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="kt-pressable flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-[20px] border-2 border-dashed border-sky-300 bg-sky-50/70 px-2 text-center text-sky-800 transition hover:bg-sky-100"
      >
        <span className="relative grid h-10 w-10 place-items-center rounded-2xl bg-white text-sky-700 shadow-sm">
          <HiOutlinePhoto className="text-xl" />
          <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-sky-700 text-white">
            <HiOutlinePlus className="text-xs" />
          </span>
        </span>
        <span className="text-[11px] font-black leading-tight">{t("postCard.addMedia")}</span>
      </button>
    );
  }

  // iOS shows a video's first frame only once it is asked for a time.
  const frameTime = Math.max(0, Number(trimStart) || 0) + 0.1;

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[20px] bg-slate-950 shadow-sm">
      <button type="button" onClick={onPick} aria-label={t("postCard.change")} className="absolute inset-0">
        {videoPreview ? (
          <video
            src={`${videoPreview}#t=${frameTime.toFixed(1)}`}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <img src={imagePreview} alt="" className="h-full w-full object-cover" />
        )}
      </button>
      {videoPreview ? (
        <span className="pointer-events-none absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-slate-950/70 text-white">
          <HiOutlineVideoCamera className="text-xs" />
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("postCard.remove")}
        className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-slate-800 shadow"
      >
        <HiOutlineXMark className="text-sm" />
      </button>
      {videoPreview && videoCheck ? (
        <span
          role="status"
          className={`pointer-events-none absolute inset-x-1.5 inline-flex h-6 items-center justify-center gap-1 rounded-full px-1 text-[10px] font-black tabular-nums text-white ${onTrim ? "bottom-10" : "bottom-1.5"} ${videoCheck.status === "too-large" ? "bg-rose-600" : "bg-slate-950/80"}`}
        >
          {videoCheck.seconds ? <span>{clipClock(videoCheck.seconds)}</span> : null}
          {videoCheck.seconds ? <span aria-hidden="true">·</span> : null}
          {videoCheck.status === "checking" ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <span>{formatVideoMb(videoCheck.bytes)} {t("ui.literals.k6e979f426b67")}</span>
          )}
        </span>
      ) : null}
      {videoPreview && onTrim ? (
        <button
          type="button"
          onClick={onTrim}
          className="absolute inset-x-1.5 bottom-1.5 inline-flex h-7 items-center justify-center gap-1 rounded-full bg-slate-950/80 text-[11px] font-black text-white"
        >
          <HiOutlineScissors className="text-xs" /> {t("postCard.trim")}
        </button>
      ) : null}
    </div>
  );
}
