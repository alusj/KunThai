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

// REVERTED (per user request): image resizing is disabled — every caller now
// receives the original full-resolution URL unchanged, exactly as before the
// resizing work. The `resize: "cover"` transform was cropping images to fill the
// box, which looked zoomed/off. The call sites are left in place so a corrected
// version (e.g. proportional scale, no crop) can be re-enabled here in one spot
// without touching every component again.
//
// eslint-disable-next-line no-unused-vars
export function resizedImageUrl(url, options = {}) {
  return url;
}
