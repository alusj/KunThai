import { HiOutlinePhoto, HiOutlinePlus, HiOutlineScissors, HiOutlineVideoCamera, HiOutlineXMark } from "react-icons/hi2";

import { useI18n } from "../../../../../../i18n";

// The post card's media box: the picked photo or the video's first frame, or a
// button to pick one. Picking opens the phone's gallery for photos and videos.
export default function PostMediaTile({ imagePreview = "", videoPreview = "", trimStart = 0, onPick, onRemove, onTrim }) {
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
