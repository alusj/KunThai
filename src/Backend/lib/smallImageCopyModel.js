// Small copies of public photos (2026-11-03). Supabase's own image resizing
// is a paid feature ("FeatureNotEnabled" on this project), so each photo
// uploaded to a public bucket also gets a small copy beside it:
//   <path>.jpg  ->  <path>.jpg.sm.jpg   (640 px wide JPEG, whole frame, no crop)
// Lists, grids and avatars show the small copy; full-screen viewers and large
// banners keep the original. No Supabase or DOM access, so it is unit-tested.

export const SMALL_COPY_WIDTH = 640;
export const SMALL_COPY_SUFFIX = ".sm.jpg";
export const SMALL_COPY_BUCKETS = ["explore-media", "marketplace-business-media", "transport-public-media"];

const PUBLIC_PATH = "/storage/v1/object/public/";
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|heic|heif)$/i;

// The storage path of an original's small copy.
export function smallCopyPath(path = "") {
  return `${path}${SMALL_COPY_SUFFIX}`;
}

// { bucket, path } of a public Storage photo that can have a small copy, or
// null (another bucket, a video, a data:/blob: preview, a remote URL, or
// already a small copy).
export function smallCopyTarget(url = "") {
  const value = String(url || "");
  const at = value.indexOf(PUBLIC_PATH);
  if (at < 0 || !/^https?:\/\//i.test(value)) return null;
  const rest = value.slice(at + PUBLIC_PATH.length).split(/[?#]/)[0];
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (!SMALL_COPY_BUCKETS.includes(bucket) || !IMAGE_EXTENSION.test(path) || path.endsWith(SMALL_COPY_SUFFIX)) return null;
  return { bucket, path };
}

// The small copy's URL for a photo shown at `width` CSS pixels or less than
// SMALL_COPY_WIDTH, else the original. `missing` holds originals whose small
// copy failed to load once (they are shown as originals from then on).
export function smallCopyUrl(url, width, missing = null) {
  if (!width || width > SMALL_COPY_WIDTH) return url;
  if (!smallCopyTarget(url)) return url;
  const original = String(url).split(/[?#]/)[0];
  if (missing?.has?.(original)) return url;
  return `${original}${SMALL_COPY_SUFFIX}`;
}

// The original behind a small copy's URL, or "" when it is not one.
export function originalOfSmallCopy(url = "") {
  const value = String(url || "").split(/[?#]/)[0];
  if (!value.endsWith(SMALL_COPY_SUFFIX) || !value.includes(PUBLIC_PATH)) return "";
  return value.slice(0, -SMALL_COPY_SUFFIX.length);
}

// The size a small copy is drawn at: SMALL_COPY_WIDTH wide, height kept in
// proportion; a photo already narrower keeps its size.
export function smallCopySize(width, height) {
  if (!width || !height) return null;
  const scale = Math.min(1, SMALL_COPY_WIDTH / width);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
