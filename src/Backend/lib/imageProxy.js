// Cut Supabase Storage egress by serving a resized, recompressed copy of an image
// instead of the full-resolution original.
//
// Storage image URLs are produced by getPublicUrl as `/storage/v1/object/public/…`
// links, stored in the database, and rendered straight into <img> tags. Every list,
// grid and avatar that paints one of these downloads the full original — the single
// biggest driver of Egress. This rewrites such a link to Supabase's transform
// endpoint (`/storage/v1/render/image/public/…`) with a width and quality applied,
// so a 2 MB photo shown as a thumbnail ships as ~30–60 KB instead.
//
// Safe pass-through: anything that is NOT a Supabase Storage image object URL —
// empty/nullish values, data:/blob: previews, remote URLs, videos/audio, or a URL
// that is already a transform URL — is returned unchanged. Callers can therefore
// wrap every `src` unconditionally without special-casing.
//
// Use the full-resolution original (do not wrap) for full-screen viewers and image
// zoom, where quality matters and the image is fetched once on demand.

// Supabase's resize endpoint is a paid feature (it answers "FeatureNotEnabled"
// here), and its `resize: "cover"` cropped photos, which looked zoomed. Now a
// photo shown at 640 px or less uses the small copy saved beside it at upload
// (smallImageCopyModel.js): the whole frame, scaled down, never cropped. Larger
// sizes, full-screen viewers and anything without a small copy get the
// original. `quality` is accepted for older callers and ignored.
import { smallCopyUrl } from "./smallImageCopyModel.js";
import { missingSmallCopies } from "./smallImageCopy.js";

export function resizedImageUrl(url, options = {}) {
  return smallCopyUrl(url, Number(options.width) || 0, missingSmallCopies);
}
