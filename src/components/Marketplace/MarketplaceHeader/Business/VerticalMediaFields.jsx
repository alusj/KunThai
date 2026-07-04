import { AlertTriangle, Film, ImagePlus, X } from "lucide-react";
import { useState } from "react";

import {
  formatFileSize,
  MAX_VERTICAL_VIDEO_BYTES,
  REQUIRED_EXTRA_IMAGE_COUNT,
  validateVerticalVideo,
} from "../../../../Backend/services/marketplace/verticalMediaValidation";

export default function VerticalMediaFields({ media, setMedia, accent = "emerald", noun = "listing" }) {
  const [caution, setCaution] = useState("");
  const accentClass = accent === "orange" ? "border-orange-200 bg-orange-50" : accent === "blue" ? "border-blue-200 bg-blue-50" : "border-violet-200 bg-violet-50";

  async function chooseVideo(file) {
    if (!file) return;
    if (file.size >= MAX_VERTICAL_VIDEO_BYTES) {
      setMedia((current) => ({ ...current, videoFile: null, videoDuration: 0 }));
      setCaution(`Your video is ${formatFileSize(file.size)}. We can only accept videos less than 50 MB. Please compress it and try again.`);
      return;
    }
    try {
      const { duration } = await validateVerticalVideo(file);
      setCaution("");
      setMedia((current) => ({ ...current, videoFile: file, videoDuration: duration }));
    } catch (error) {
      setMedia((current) => ({ ...current, videoFile: null, videoDuration: 0 }));
      setCaution(error.message);
    }
  }

  return (
    <>
      <div className={`grid gap-3 rounded-2xl border p-4 sm:col-span-2 sm:grid-cols-3 ${accentClass}`}>
        <MediaInput label="1 cover image" detail={media.coverImageFile?.name || (media.image_url || media.image_urls?.length ? "Current cover kept" : "Required")} icon={ImagePlus} accept="image/*" onFiles={(files) => setMedia((current) => ({ ...current, coverImageFile: files[0] || null }))} />
        <MediaInput label={`At least ${REQUIRED_EXTRA_IMAGE_COUNT} extra images`} detail={media.extraImageFiles.length ? `${media.extraImageFiles.length} selected` : media.image_urls?.length ? "Current gallery kept" : "Five or more are required"} icon={ImagePlus} accept="image/*" multiple onFiles={(files) => {
          const selected = Array.from(files);
          setMedia((current) => ({ ...current, extraImageFiles: selected }));
          setCaution(files.length && files.length < REQUIRED_EXTRA_IMAGE_COUNT ? `Choose at least ${REQUIRED_EXTRA_IMAGE_COUNT} extra images for this ${noun}.` : "");
        }} />
        <MediaInput label="1 video" detail={media.videoFile ? `${formatFileSize(media.videoFile.size)} · ${Math.ceil(media.videoDuration)} sec` : media.video_url ? "Current video kept" : "30 sec maximum · less than 50 MB"} icon={Film} accept="video/*" onFiles={(files) => chooseVideo(files[0])} />
      </div>

      {caution ? (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[1500] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-2xl" role="alert">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-200"><AlertTriangle size={20} /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-black">Video upload caution</p><p className="mt-1 text-sm font-semibold leading-5">{caution}</p></div>
            <button type="button" onClick={() => setCaution("")} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/80" aria-label="Close caution"><X size={16} /></button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MediaInput({ accept, detail, icon: Icon, label, multiple = false, onFiles }) {
  return (
    <label className="cursor-pointer rounded-xl border border-white/80 bg-white p-3 shadow-sm">
      <span className="flex items-center gap-2 text-xs font-black text-gray-800"><Icon size={17} /> {label}</span>
      <span className="mt-2 block truncate text-xs font-semibold text-gray-500">{detail}</span>
      <input type="file" accept={accept} multiple={multiple} className="sr-only" onChange={(event) => onFiles(event.target.files || [])} />
    </label>
  );
}
