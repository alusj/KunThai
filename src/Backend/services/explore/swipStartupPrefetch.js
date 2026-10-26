import supabase from "../../lib/supabaseClient";
import { adoptFeedAccount, prefetchExploreFeed } from "../../hooks/useExploreFeed";
import { isGuestMode } from "../guestModeService";
import { readExploreSettings } from "./preferencesService";
import { recordLifecycle } from "../lifecycleAudit";
import { getSwipVideos, isRenderableSwipPost } from "../../../components/Explore/ExploreTabs/swip/videos/swipUtils";

// Swip starts at once on a fresh start: while the native splash is still up,
// the Swip feed's first page is fetched and its first clip or two downloaded
// to the phone, so when Swip is shown its first video is already there and
// plays straight away (VideoCard plays the downloaded copy).
//
// Data: only the first clips, only when they are small, and none at all with
// "Reduce data" on, the phone's data saver on or a 2G connection (one clip on
// 3G). The downloaded copies are released after a while either way.

const MAX_CLIPS = 2;
const MAX_CLIP_BYTES = 12 * 1024 * 1024;
const KEEP_MS = 10 * 60 * 1000;

const downloaded = new Map(); // postId -> { url, timer }
let started = false;
// Sent with { postId } when a clip's copy is ready, for a card already shown.
export const SWIP_STARTUP_VIDEO_EVENT = "kunthai-swip-startup-video";

function forget(postId) {
  const entry = downloaded.get(postId);
  if (!entry) return;
  downloaded.delete(postId);
  window.clearTimeout(entry.timer);
  try {
    URL.revokeObjectURL(entry.url);
  } catch {
    // Already released.
  }
}

// The downloaded copy of a Swip clip, or "" (then it streams as usual).
export function swipStartupVideoUrl(postId) {
  return (postId && downloaded.get(postId)?.url) || "";
}

// The copy could not be played: stream the clip from now on.
export function dropSwipStartupVideo(postId) {
  forget(postId);
}

function clipsAllowed() {
  if (readExploreSettings().video.reduceData) return 0;
  const connection = typeof navigator !== "undefined"
    ? navigator.connection || navigator.mozConnection || navigator.webkitConnection
    : null;
  const effectiveType = String(connection?.effectiveType || "").toLowerCase();
  if (connection?.saveData || effectiveType === "slow-2g" || effectiveType === "2g") return 0;
  if (effectiveType === "3g") return 1;
  return MAX_CLIPS;
}

async function downloadClip(post) {
  if (downloaded.has(post.id) || typeof fetch !== "function") return;
  const response = await fetch(post.video_url, { credentials: "omit" });
  if (!response.ok) return;
  const size = Number(response.headers.get("content-length") || 0);
  if (size > MAX_CLIP_BYTES) {
    // Too big to hold in memory: let it stream, but leave its start cached.
    response.body?.cancel?.().catch(() => {});
    return;
  }
  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_CLIP_BYTES) return;
  const type = blob.type && blob.type.startsWith("video/") ? blob.type : "video/mp4";
  const url = URL.createObjectURL(type === blob.type ? blob : blob.slice(0, blob.size, type));
  const timer = window.setTimeout(() => forget(post.id), KEEP_MS);
  downloaded.set(post.id, { url, timer });
  recordLifecycle("swip-prefetch", "clip", `${Math.round(blob.size / 1024)} KB at ${Math.round(performance.now())} ms`);
  window.dispatchEvent(new CustomEvent(SWIP_STARTUP_VIDEO_EVENT, { detail: { postId: post.id } }));
}

// Called once from main.jsx, before React renders anything.
export function startSwipStartupPrefetch() {
  if (started || typeof window === "undefined") return;
  started = true;
  (async () => {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    // Signed out (Login is next), or a leftover guest visit App ends anyway.
    if (!user || (user.is_anonymous && !isGuestMode())) return;
    // Another account's saved feed is dropped first, as the feed hooks would.
    adoptFeedAccount(user.id);

    const posts = await prefetchExploreFeed("swip");
    recordLifecycle("swip-prefetch", "feed", `${posts.length} posts at ${Math.round(performance.now())} ms`);
    const clips = getSwipVideos(posts).filter(isRenderableSwipPost).slice(0, clipsAllowed());
    // One after the other, so the first clip gets the whole connection.
    for (const post of clips) {
      await downloadClip(post).catch(() => {});
    }
  })().catch(() => {});
}
