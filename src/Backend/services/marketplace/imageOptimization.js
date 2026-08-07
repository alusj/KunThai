// Shared client-side image optimizer for UrMall uploads.
//
// Purpose: cut Supabase Storage size AND Egress. Phone photos are often 3-8 MB at
// 4000px+; stored raw they inflate the bucket and every buyer view re-downloads the
// full-resolution file. Downscaling to a sane max dimension + JPEG re-encode before
// upload shrinks each asset by 5-10x with no visible quality loss on product cards.
//
// Falls back to the original file whenever the browser can't decode/encode it, or
// when re-encoding would not actually be smaller (e.g. already-optimized images).

const IMAGE_UPLOAD_MAX_WIDTH = 1600;
const IMAGE_UPLOAD_MAX_HEIGHT = 1600;
const IMAGE_UPLOAD_QUALITY = 0.82;

// GIF/SVG are skipped: re-encoding to JPEG would drop animation/vector fidelity.
function isCompressibleImage(file) {
  return file?.type?.startsWith("image/") && !["image/gif", "image/svg+xml"].includes(file.type);
}

function getCanvasBlob(canvas, type = "image/jpeg", quality = IMAGE_UPLOAD_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Unable to prepare image for upload."));
      },
      type,
      quality,
    );
  });
}

async function loadImageElement(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Downscale + re-encode an image File. Returns the original File unchanged when it
// is not a compressible image, on any failure, or when the result isn't smaller.
export async function optimizeImageFile(file) {
  if (!isCompressibleImage(file)) return file;

  try {
    const image = await loadImageElement(file);
    const scale = Math.min(1, IMAGE_UPLOAD_MAX_WIDTH / image.naturalWidth, IMAGE_UPLOAD_MAX_HEIGHT / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);

    const blob = await getCanvasBlob(canvas);
    if (blob.size >= file.size) return file;

    const optimizedName = (file.name || "image").replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${optimizedName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
