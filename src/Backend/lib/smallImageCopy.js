import supabase from "./supabaseClient";
import {
  originalOfSmallCopy,
  smallCopyPath,
  smallCopySize,
  SMALL_COPY_BUCKETS,
} from "./smallImageCopyModel.js";

const MISSING_KEY = "kt-small-copy-missing";
const MISSING_MAX = 300;

// Originals whose small copy failed to load: shown as originals from then on.
export const missingSmallCopies = new Set(readMissing());

function readMissing() {
  try {
    const list = JSON.parse(localStorage.getItem(MISSING_KEY) || "[]");
    return Array.isArray(list) ? list.slice(-MISSING_MAX) : [];
  } catch {
    return [];
  }
}

function rememberMissing(original) {
  missingSmallCopies.add(original);
  try {
    localStorage.setItem(MISSING_KEY, JSON.stringify([...missingSmallCopies].slice(-MISSING_MAX)));
  } catch {
    // The in-memory list still applies for this session.
  }
}

async function drawSmallCopy(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const size = smallCopySize(bitmap.width, bitmap.height);
    if (!size) return null;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, size.width, size.height);
    // JPEG: iPhones cannot encode WebP from a canvas.
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
  } finally {
    bitmap.close?.();
  }
}

// After a photo was uploaded to a public bucket, saves its small copy beside
// it. Never throws and never holds up the upload: without a copy the original
// is shown, as before.
export async function uploadSmallCopy(bucket, path, file) {
  try {
    if (!SMALL_COPY_BUCKETS.includes(bucket) || !path || !file) return;
    if (!String(file.type || "").startsWith("image/") || file.type === "image/gif") return;
    const blob = await drawSmallCopy(file);
    if (!blob) return;
    await supabase.storage.from(bucket).upload(smallCopyPath(path), blob, {
      cacheControl: "31536000",
      contentType: "image/jpeg",
      upsert: true,
    });
  } catch {
    // Optional: the original stays the only copy.
  }
}

// A small copy that fails to load is swapped for its original in place, and
// remembered so it is not asked for again. Installed once from main.jsx.
export function installSmallCopyFallback() {
  if (typeof document === "undefined") return;
  document.addEventListener("error", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || image.dataset.ktSmallCopyFailed) return;
    const original = originalOfSmallCopy(image.currentSrc || image.src);
    if (!original) return;
    image.dataset.ktSmallCopyFailed = "1";
    rememberMissing(original);
    image.src = original;
  }, true);
}
