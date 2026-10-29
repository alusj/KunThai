// Voice posts may carry photos (never a video). The first photo stays in the
// post's image_url, as for any photo post; the full ordered set lives in
// media_meta.images, so no schema change is needed and older posts (one
// image_url, no list) read exactly as before.

export const MAX_VOICE_POST_IMAGES = 6;

function cleanUrl(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Every photo of a post, cover first, without blanks or repeats.
export function postImageUrls(post = {}) {
  const listed = Array.isArray(post?.media_meta?.images) ? post.media_meta.images : [];
  const urls = [cleanUrl(post?.image_url), ...listed.map(cleanUrl)].filter(Boolean);
  return Array.from(new Set(urls));
}

// media_meta for a saved post: the uploaded photo set when there is more than
// one, and never a list sent in by the client (it could hold local previews).
export function withPostImages(mediaMeta = {}, imageUrls = []) {
  const { images: _clientImages, ...rest } = mediaMeta && typeof mediaMeta === "object" ? mediaMeta : {};
  const urls = Array.from(new Set(imageUrls.map(cleanUrl).filter(Boolean))).slice(0, MAX_VOICE_POST_IMAGES);
  return urls.length > 1 ? { ...rest, images: urls } : rest;
}

// How many more photos fit on a voice post that already has `count`.
export function remainingVoicePostImages(count = 0) {
  return Math.max(0, MAX_VOICE_POST_IMAGES - Math.max(0, Number(count) || 0));
}
