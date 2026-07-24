import { useState } from "react";
import { Scissors } from "lucide-react";

import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";
import ProductVideoTrimmer from "./ProductVideoTrimmer";
import { MAX_PRODUCT_VIDEO_MB, MAX_PRODUCT_VIDEO_SECONDS, formatVideoMb } from "./productVideoLimits";
import { showToast } from "../../../../../Backend/services/toastService";

function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    function finish(duration) {
      URL.revokeObjectURL(url);
      resolve(duration || 0);
    }

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        finish(video.duration);
        return;
      }

      // Some recorded videos (screen captures, chat exports) report Infinity
      // until the element is seeked far past the end.
      video.ontimeupdate = () => {
        video.ontimeupdate = null;
        finish(Number.isFinite(video.duration) ? video.duration : 0);
      };
      video.currentTime = Number.MAX_SAFE_INTEGER;
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read video length."));
    };
    video.src = url;
  });
}

const MAX_EXTRA_IMAGES = 6;

export default function ProductMediaStep({ productForm }) {
  const { form, errors, updateSection } = productForm;
  const [coverGuideOpen, setCoverGuideOpen] = useState(false);
  const [videoGuideOpen, setVideoGuideOpen] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [videoTrimCandidate, setVideoTrimCandidate] = useState(null);
  const [trimmerOpen, setTrimmerOpen] = useState(false);
  const [extraImagesNote, setExtraImagesNote] = useState("");
  const extraImages = form.media.extraImageFiles || [];
  const extraImagesFull = extraImages.length >= MAX_EXTRA_IMAGES;

  return (
    <div className="space-y-5">
      <ProductFormField label="Cover image" error={errors.coverImage}>
        <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
          <p className="text-sm font-black text-blue-900">Use your best product image.</p>
          <button type="button" onClick={() => setCoverGuideOpen((current) => !current)} className="mt-1 text-sm font-black text-blue-700">
            {coverGuideOpen ? "Hide details" : "Read more"}
          </button>
          {coverGuideOpen ? (
            <p className="mt-2 text-sm font-semibold leading-6 text-blue-700">
              The cover image is usually the first thing buyers see. A bright, clear photo from a good angle helps the product look trustworthy,
              makes people stop scrolling, and can reduce repeated questions because customers understand what they are buying faster.
            </p>
          ) : null}
        </div>
        <ProductFormInput
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0] || null;
            updateSection("media", { coverImageFile: file, coverImageName: file?.name || "" });
          }}
        />
        {form.media.coverImageUrl ? (
          <p className="mt-2 text-xs font-bold text-gray-500">
            Current cover is saved. Upload a new image only if you want to replace it.
          </p>
        ) : null}
      </ProductFormField>

      <ProductFormField label="Extra images up to 6" error={extraImagesNote}>
        <ProductFormInput
          type="file"
          accept="image/*"
          multiple
          disabled={extraImagesFull}
          onClick={(event) => {
            // Stop the picker from even opening once six are chosen.
            if (extraImagesFull) {
              event.preventDefault();
              showToast(`You already have the maximum of ${MAX_EXTRA_IMAGES} images. Remove one to add another.`, "danger", { title: "UrMall" });
            }
          }}
          onChange={(event) => {
            const incoming = Array.from(event.target.files || []);
            event.target.value = "";
            if (!incoming.length) return;
            const room = Math.max(MAX_EXTRA_IMAGES - extraImages.length, 0);
            const accepted = incoming.slice(0, room);
            // Six is a hard stop: extra selections are dropped and the seller is
            // told with a toast, whether they were already full or just went over.
            if (incoming.length > room) {
              setExtraImagesNote(`We can only accept ${MAX_EXTRA_IMAGES} images.`);
              showToast(`We can only accept ${MAX_EXTRA_IMAGES} images.`, "danger", { title: "UrMall" });
            } else {
              setExtraImagesNote("");
            }
            if (accepted.length) {
              updateSection("media", { extraImageFiles: [...extraImages, ...accepted] });
            }
          }}
        />
        {extraImagesFull ? (
          <p className="mt-2 text-xs font-bold text-emerald-700">
            All {MAX_EXTRA_IMAGES} extra images are added. Remove one below to choose a different image.
          </p>
        ) : (
          <p className="mt-2 text-xs font-bold text-gray-500">
            {extraImages.length} of {MAX_EXTRA_IMAGES} selected
          </p>
        )}
        {extraImages.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {extraImages.map((file, index) => (
              <span key={`${file.name}-${index}`} className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-700">
                <span className="max-w-32 truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    setExtraImagesNote("");
                    updateSection("media", { extraImageFiles: extraImages.filter((_, itemIndex) => itemIndex !== index) });
                  }}
                  className="grid h-4 w-4 place-items-center rounded-full bg-gray-100 text-gray-600"
                  aria-label={`Remove ${file.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </ProductFormField>

      <ProductFormField label="Short product video">
        <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50 p-3">
          <p className="text-sm font-black text-amber-900">Add your best 30 seconds product video.</p>
          <button type="button" onClick={() => setVideoGuideOpen((current) => !current)} className="mt-1 text-sm font-black text-amber-700">
            {videoGuideOpen ? "Hide details" : "Read more"}
          </button>
          {videoGuideOpen ? (
            <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
              A short video lets buyers see movement, scale, texture, packaging, and real condition. Keep it focused: show the product clearly,
              demonstrate the main feature, and avoid long clips so it loads quickly for customers.
            </p>
          ) : null}
        </div>
        <ProductFormInput
          type="file"
          accept="video/*"
          onChange={async (event) => {
            const file = event.target.files?.[0] || null;
            setVideoError("");
            setVideoTrimCandidate(null);

            if (file) {
              if (file.size > MAX_PRODUCT_VIDEO_MB * 1024 * 1024) {
                setVideoError(
                  `Your video is ${formatVideoMb(file.size)} MB and we are only accepting a video that is less than ${MAX_PRODUCT_VIDEO_MB} MB for now.`,
                );
                setVideoTrimCandidate(file);
                event.target.value = "";
                updateSection("media", { videoFile: null, videoName: "" });
                return;
              }

              try {
                const duration = await readVideoDuration(file);
                if (duration > MAX_PRODUCT_VIDEO_SECONDS + 0.5) {
                  setVideoError(
                    `Your video is ${Math.round(duration)} seconds and we are only accepting a video that is ${MAX_PRODUCT_VIDEO_SECONDS} seconds or less for now.`,
                  );
                  setVideoTrimCandidate(file);
                  event.target.value = "";
                  updateSection("media", { videoFile: null, videoName: "" });
                  return;
                }
              } catch {
                setVideoError(`Unable to check this video. Please choose a ${MAX_PRODUCT_VIDEO_SECONDS} seconds or shorter video.`);
                event.target.value = "";
                updateSection("media", { videoFile: null, videoName: "" });
                return;
              }
            }

            updateSection("media", { videoFile: file, videoName: file?.name || "" });
          }}
        />
        {videoError ? (
          <div className="mt-2 space-y-2">
            <p className="text-xs font-bold text-red-600">{videoError}</p>
            {videoTrimCandidate ? (
              <button
                type="button"
                onClick={() => setTrimmerOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-black text-white transition hover:bg-gray-800"
              >
                <Scissors size={15} />
                Trim
              </button>
            ) : null}
          </div>
        ) : null}
      </ProductFormField>

      {trimmerOpen && videoTrimCandidate ? (
        <ProductVideoTrimmer
          file={videoTrimCandidate}
          onCancel={() => setTrimmerOpen(false)}
          onComplete={(trimmedFile) => {
            setTrimmerOpen(false);
            setVideoTrimCandidate(null);
            setVideoError("");
            updateSection("media", { videoFile: trimmedFile, videoName: trimmedFile.name });
          }}
        />
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm font-medium text-gray-600 [overflow-wrap:anywhere]">
        <p className="break-all">Cover: {form.media.coverImageName || "Not selected"}</p>
        <p className="mt-1">
          Extra images: {form.media.extraImageFiles.length || form.media.extraImageUrls?.length || 0}
        </p>
        <p className="mt-1 break-all">Video: {form.media.videoName || "Not selected"}</p>
      </div>
    </div>
  );
}
