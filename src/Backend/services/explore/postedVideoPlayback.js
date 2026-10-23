// A video someone has just posted plays from the file still on their phone
// the first time they see it, so it starts at once instead of streaming back
// the copy that was only just uploaded. The file is the exact one uploaded
// (in the app: already compressed and cut to the trim), so the post's clip
// start and end line up with it. Everyone else, and later views, use the
// uploaded copy.
//
// The composer also waits here (waitForPostedVideoPlaying) to finish its
// progress ring only once the video is actually playing in Swip.

const KEEP_MS = 15 * 60 * 1000;
const MAX_KEPT = 2;
export const POSTED_VIDEO_PLAYING_EVENT = "kunthai-posted-video-playing";

const kept = new Map(); // postId -> { url, timer }

function forget(postId) {
  const entry = kept.get(postId);
  if (!entry) return;
  kept.delete(postId);
  window.clearTimeout(entry.timer);
  try {
    URL.revokeObjectURL(entry.url);
  } catch {
    // Already released.
  }
}

export function rememberPostedVideoFile(postId, file) {
  if (typeof window === "undefined" || !postId || !file || typeof URL?.createObjectURL !== "function") return;
  forget(postId);
  let url = "";
  try {
    url = URL.createObjectURL(file);
  } catch {
    return;
  }
  const timer = window.setTimeout(() => forget(postId), KEEP_MS);
  kept.set(postId, { url, timer });
  while (kept.size > MAX_KEPT) forget(kept.keys().next().value);
}

export function postedVideoLocalUrl(postId) {
  return (postId && kept.get(postId)?.url) || "";
}

// The phone's copy could not be played (released, unreadable): use the
// uploaded copy from now on.
export function dropPostedVideoFile(postId) {
  forget(postId);
}

export function notifyPostedVideoPlaying(postId) {
  if (typeof window === "undefined" || !postId) return;
  window.dispatchEvent(new CustomEvent(POSTED_VIDEO_PLAYING_EVENT, { detail: { postId } }));
}

// Resolves true once the posted video is playing on screen, false after
// timeoutMs (the composer then finishes anyway).
export function waitForPostedVideoPlaying(postId, timeoutMs = 6000) {
  if (typeof window === "undefined" || !postId) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (value) => {
      window.clearTimeout(timer);
      window.removeEventListener(POSTED_VIDEO_PLAYING_EVENT, onPlaying);
      resolve(value);
    };
    const onPlaying = (event) => {
      if (event.detail?.postId === postId) done(true);
    };
    const timer = window.setTimeout(() => done(false), timeoutMs);
    window.addEventListener(POSTED_VIDEO_PLAYING_EVENT, onPlaying);
  });
}
