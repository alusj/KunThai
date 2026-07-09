import { useState } from "react";

import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";

function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration || 0);
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
          onChange={(event) => {
            const incoming = Array.from(event.target.files || []);
            event.target.value = "";
            if (!incoming.length) return;
            const room = MAX_EXTRA_IMAGES - extraImages.length;
            const accepted = incoming.slice(0, Math.max(room, 0));
            setExtraImagesNote(incoming.length > room ? `Only ${MAX_EXTRA_IMAGES} extra images are allowed. The first ${MAX_EXTRA_IMAGES} were kept.` : "");
            updateSection("media", { extraImageFiles: [...extraImages, ...accepted] });
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

            if (file) {
              try {
                const duration = await readVideoDuration(file);
                if (duration > 30.5) {
                  setVideoError("Product video must be 30 seconds or less.");
                  event.target.value = "";
                  updateSection("media", { videoFile: null, videoName: "" });
                  return;
                }
              } catch {
                setVideoError("Unable to check this video. Please choose a 30 seconds or shorter video.");
                event.target.value = "";
                updateSection("media", { videoFile: null, videoName: "" });
                return;
              }
            }

            updateSection("media", { videoFile: file, videoName: file?.name || "" });
          }}
        />
        {videoError ? <p className="mt-2 text-xs font-bold text-red-600">{videoError}</p> : null}
      </ProductFormField>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm font-medium text-gray-600">
        <p>Cover: {form.media.coverImageName || "Not selected"}</p>
        <p className="mt-1">
          Extra images: {form.media.extraImageFiles.length || form.media.extraImageUrls?.length || 0}
        </p>
        <p className="mt-1">Video: {form.media.videoName || "Not selected"}</p>
      </div>
    </div>
  );
}
