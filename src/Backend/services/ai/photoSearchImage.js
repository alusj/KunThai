// UrMall photo search — turn the shopper's photo into a small JPEG for KAI.
//
// Phone photos are often 3-12 MB, 4000px+, rotated by EXIF, and sometimes
// HEIC. The server accepts one JPEG/PNG/WebP of at most ~420 KB, so the photo
// is decoded here (createImageBitmap first, then an <img>), scaled to 768px on
// its long side and re-encoded until it fits. Nothing is uploaded or kept.

export const PHOTO_SEARCH_MAX_DIMENSION = 768;
export const PHOTO_SEARCH_MAX_BYTES = 380_000;
const DECODE_TIMEOUT_MS = 15_000;
const ENCODE_STEPS = [
  { dimension: PHOTO_SEARCH_MAX_DIMENSION, quality: 0.82 },
  { dimension: PHOTO_SEARCH_MAX_DIMENSION, quality: 0.66 },
  { dimension: 512, quality: 0.66 },
];

/** Decoded size of a base64 data URL, in bytes. */
export function dataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Width and height that fit `max` on the long side, never upscaled. */
export function fitDimensions(width, height, max) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(1, max / Math.max(safeWidth, safeHeight));
  return { width: Math.max(1, Math.round(safeWidth * scale)), height: Math.max(1, Math.round(safeHeight * scale)) };
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("decode-timeout")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function decodePhoto(file) {
  if (typeof createImageBitmap === "function") {
    try {
      // Applies the EXIF rotation, so a portrait phone photo is not sideways.
      return await withTimeout(createImageBitmap(file, { imageOrientation: "from-image" }), DECODE_TIMEOUT_MS);
    } catch {
      // Some browsers refuse the options object or the format here; the
      // <img> path below decodes what the browser can display.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await withTimeout(image.decode(), DECODE_TIMEOUT_MS);
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(source, width, height, dimension, quality) {
  const size = fitDimensions(width, height, dimension);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return "";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(source, 0, 0, size.width, size.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Prepare a picked photo for KAI. Resolves { image } with a JPEG data URL, or
 * { error: "unreadable" } when this browser cannot open the format (e.g.
 * HEIC outside Safari) and { error: "failed" } for anything else.
 */
export async function preparePhotoForSearch(file) {
  if (!file || typeof document === "undefined") return { error: "failed" };
  let source;
  try {
    source = await decodePhoto(file);
  } catch {
    // The browser cannot open this format (HEIC outside Safari, a RAW file).
    return { error: "unreadable" };
  }
  try {
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    if (!width || !height) return { error: "unreadable" };
    for (const step of ENCODE_STEPS) {
      const image = encode(source, width, height, step.dimension, step.quality);
      if (image && image.startsWith("data:image/jpeg") && dataUrlBytes(image) <= PHOTO_SEARCH_MAX_BYTES) return { image };
    }
    return { error: "failed" };
  } catch {
    return { error: "failed" };
  } finally {
    source?.close?.();
  }
}
